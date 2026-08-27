import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  WorkflowListResponseSchema,
  WorkflowNodeRunSchema,
  WorkflowRunDetailResponseSchema,
  WorkflowRunEventSchema,
  WorkflowRunListResponseSchema,
  WorkflowRunSchema,
  type CreateWorkflowRequest,
  type RunNodeRequest,
  type RunWorkflowRequest,
  type UpdateWorkflowRequest,
  type ValidateWorkflowRequest,
  type WorkflowRunEvent,
} from '@ai-engine/contracts';
import type { NodeRegistry } from './nodes/registry';
import { VariablePool } from './engine/variable-pool';
import {
  WorkflowGraphValidationError,
  WorkflowNodeExecutionError,
  type WorkflowEngine,
} from './engine/workflow-engine';
import {
  WORKFLOW_REPOSITORY,
  type WorkflowRepository,
  type WorkflowNodeRunRecord,
  type WorkflowRunRecord,
} from './workflow.repository';
import { NODE_REGISTRY, WORKFLOW_ENGINE } from './workflow.tokens';
import { validateWorkflowGraph } from './engine/graph-validator';

const notFound = (resource: string): Error => new Error(`NOT_FOUND:${resource}不存在`);
const executionErrorMessage = (error: unknown): string => {
  if (error instanceof WorkflowNodeExecutionError && error.cause instanceof Error) {
    return error.cause.message;
  }
  return error instanceof Error ? error.message : '工作流执行失败';
};

const toRunDto = (run: WorkflowRunRecord) => {
  return WorkflowRunSchema.parse({
    ...run,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
  });
};

@Injectable()
export class WorkflowService {
  private readonly activeRuns = new Map<string, AbortController>();

  constructor(
    @Inject(WORKFLOW_REPOSITORY) private readonly repository: WorkflowRepository,
    @Inject(WORKFLOW_ENGINE) private readonly engine: WorkflowEngine,
    @Inject(NODE_REGISTRY) private readonly registry: NodeRegistry,
  ) {}

  createWorkflow(request: CreateWorkflowRequest) {
    return this.repository.createWorkflow(request);
  }

  async listWorkflows() {
    return WorkflowListResponseSchema.parse({
      workflows: await this.repository.listWorkflows(),
    });
  }

  async getWorkflow(id: string) {
    const workflow = await this.repository.getWorkflow(id);
    if (!workflow) throw notFound('工作流');
    return workflow;
  }

  async updateWorkflow(id: string, request: UpdateWorkflowRequest) {
    const workflow = await this.repository.updateWorkflow(id, request);
    if (!workflow) throw notFound('工作流');
    return workflow;
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.getWorkflow(id);
    await this.repository.deleteWorkflow(id);
  }

  async validate(id: string, graphOverride?: ValidateWorkflowRequest) {
    const workflow = await this.getWorkflow(id);
    return validateWorkflowGraph(graphOverride ?? workflow.graph, this.registry);
  }

  async assertRunnable(id: string): Promise<void> {
    const result = await this.validate(id);
    if (!result.valid) {
      throw new WorkflowGraphValidationError(result.errors.map((item) => item.message));
    }
  }

  async listRuns(workflowId: string) {
    await this.getWorkflow(workflowId);
    return WorkflowRunListResponseSchema.parse({
      runs: (await this.repository.listRuns(workflowId)).map(toRunDto),
    });
  }

  async getRun(runId: string) {
    const run = await this.repository.getRun(runId);
    if (!run) throw notFound('运行记录');
    return WorkflowRunDetailResponseSchema.parse({
      run: toRunDto(run),
      nodeRuns: (await this.repository.listNodeRuns(runId)).map((nodeRun) =>
        WorkflowNodeRunSchema.parse({
          ...nodeRun,
          createdAt: nodeRun.createdAt.toISOString(),
        }),
      ),
    });
  }

  async stream(
    workflowId: string,
    request: RunWorkflowRequest,
    disconnected: AbortSignal,
    emit: (event: WorkflowRunEvent) => void,
  ): Promise<void> {
    const workflow = await this.getWorkflow(workflowId);
    const run = await this.repository.createRun(workflowId, request.inputs, workflow.graph);
    const controller = new AbortController();
    const stopOnDisconnect = () => controller.abort(new Error('客户端已断开'));
    if (disconnected.aborted) stopOnDisconnect();
    else disconnected.addEventListener('abort', stopOnDisconnect, { once: true });
    this.activeRuns.set(run.id, controller);
    const nodeRuns = new Map<string, WorkflowNodeRunRecord>();
    let terminalSent = false;
    const emitTracked = (event: WorkflowRunEvent) => {
      if (event.event === 'workflow_finished' || event.event === 'workflow_failed') {
        terminalSent = true;
      }
      emit(event);
    };

    try {
      const result = await this.engine.execute({
        runId: run.id,
        graph: workflow.graph,
        inputs: request.inputs,
        signal: controller.signal,
        emit: emitTracked,
        observer: {
          onNodeStarted: async (nodeId, inputs) => {
            nodeRuns.set(
              nodeId,
              await this.repository.createNodeRun({ runId: run.id, nodeId, inputs }),
            );
          },
          onNodeFinished: async (nodeId, outputs, elapsedMs) => {
            const nodeRun = nodeRuns.get(nodeId);
            if (nodeRun) {
              await this.repository.updateNodeRun(nodeRun.id, {
                status: 'completed',
                outputs,
                elapsedMs,
              });
            }
          },
          onNodeFailed: async (nodeId, error, elapsedMs) => {
            const nodeRun = nodeRuns.get(nodeId);
            if (nodeRun) {
              await this.repository.updateNodeRun(nodeRun.id, {
                status: controller.signal.aborted ? 'stopped' : 'failed',
                elapsedMs,
                error: error.message,
              });
            }
          },
        },
      });
      this.activeRuns.delete(run.id);
      await this.repository.updateRun(run.id, {
        status: result.status,
        outputs: result.outputs,
        finishedAt: new Date(),
      });
    } catch (error) {
      const stopped = controller.signal.aborted;
      const message = executionErrorMessage(error);
      await this.repository.updateRun(run.id, {
        status: stopped ? 'stopped' : 'failed',
        error: stopped ? null : message,
        finishedAt: new Date(),
      });
      if (!terminalSent) {
        const event = WorkflowRunEventSchema.parse(
          stopped
            ? {
                event: 'workflow_finished',
                data: {
                  runId: run.id,
                  outputs: {},
                  totalElapsedMs: Math.max(0, Date.now() - run.startedAt.getTime()),
                  status: 'stopped',
                },
              }
            : {
                event: 'workflow_failed',
                data: {
                  runId: run.id,
                  error: message,
                },
              },
        );
        emitTracked(event);
      }
    } finally {
      disconnected.removeEventListener('abort', stopOnDisconnect);
      this.activeRuns.delete(run.id);
    }
  }

  stop(runId: string): { accepted: boolean } {
    const controller = this.activeRuns.get(runId);
    if (!controller || controller.signal.aborted) return { accepted: false };
    controller.abort(new Error('用户停止'));
    return { accepted: true };
  }

  async runNode(workflowId: string, nodeId: string, request: RunNodeRequest) {
    const workflow = await this.getWorkflow(workflowId);
    const node = workflow.graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw notFound('节点');
    const runner = this.registry.get(node.data.type);
    const config = runner.configSchema.parse({
      ...node.data.config,
      ...request.configOverride,
    });
    const { sys = {}, ...upstreamValues } = request.upstreamValues;
    const pool = new VariablePool(sys, upstreamValues);
    return runner.run(config, pool, {
      runId: randomUUID(),
      nodeId,
      signal: new AbortController().signal,
      emit: () => undefined,
    });
  }
}
