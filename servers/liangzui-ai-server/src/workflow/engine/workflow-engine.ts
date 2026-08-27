import {
  NodeRunResultSchema,
  WorkflowRunEventSchema,
  type WorkflowRunEvent,
} from '@ai-engine/contracts';
import type { NodeRegistry } from '../nodes/registry';
import { topologicalOrder, validateWorkflowGraph } from './graph-validator';
import type { WorkflowExecutionInput, WorkflowExecutionResult } from './types';
import { VariablePool } from './variable-pool';

export class WorkflowGraphValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join('；'));
    this.name = 'WorkflowGraphValidationError';
  }
}

export class WorkflowNodeExecutionError extends Error {
  constructor(
    readonly nodeId: string,
    cause: unknown,
  ) {
    super(`节点 ${nodeId} 执行失败`, { cause });
    this.name = 'WorkflowNodeExecutionError';
  }
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '未知执行错误';

export class WorkflowEngine {
  constructor(private readonly registry: NodeRegistry) {}

  async execute(input: WorkflowExecutionInput): Promise<WorkflowExecutionResult> {
    const validation = validateWorkflowGraph(input.graph, this.registry);
    if (!validation.valid) {
      throw new WorkflowGraphValidationError(validation.errors.map((item) => item.message));
    }

    const startedAt = performance.now();
    const pool = new VariablePool(input.inputs);
    const activeEdges = new Set<string>();
    let outputs: Record<string, unknown> = {};
    let terminalExecuted = false;
    this.emit(input.emit, {
      event: 'workflow_started',
      data: { runId: input.runId, graphSnapshot: input.graph },
    });

    for (const nodeId of topologicalOrder(input.graph)) {
      const node = input.graph.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) continue;
      const runner = this.registry.get(node.data.type);
      const incoming = input.graph.edges.filter((edge) => edge.target === nodeId);
      if (runner.role !== 'entry' && !incoming.some((edge) => activeEdges.has(edge.id))) continue;

      if (input.signal.aborted) {
        return this.finishStopped(input, outputs, startedAt);
      }

      const config = runner.configSchema.parse(node.data.config);
      const nodeInputs = pool.snapshot();
      this.emit(input.emit, { event: 'node_started', data: { nodeId, inputs: nodeInputs } });
      await input.observer?.onNodeStarted?.(nodeId, nodeInputs);
      const nodeStartedAt = performance.now();

      try {
        const result = NodeRunResultSchema.parse(
          await runner.run(config, pool, {
            runId: input.runId,
            nodeId,
            signal: input.signal,
            emit: (text) =>
              this.emit(input.emit, {
                event: 'node_stream_chunk',
                data: { nodeId, text },
              }),
          }),
        );
        const elapsedMs = Math.max(0, Math.round(performance.now() - nodeStartedAt));
        const outgoing = input.graph.edges.filter((edge) => edge.source === nodeId);
        const activeOutgoing =
          result.nextBranch === undefined
            ? outgoing
            : outgoing.filter((edge) => edge.sourceHandle === result.nextBranch);
        if (result.nextBranch !== undefined && activeOutgoing.length === 0) {
          throw new Error(`节点 ${nodeId} 返回的分支 ${result.nextBranch} 没有匹配出边`);
        }
        pool.set(nodeId, result.outputs);
        if (runner.role === 'terminal') {
          outputs = result.outputs;
          terminalExecuted = true;
        }
        await input.observer?.onNodeFinished?.(nodeId, result.outputs, elapsedMs);
        this.emit(input.emit, {
          event: 'node_finished',
          data: { nodeId, outputs: result.outputs, elapsedMs, status: 'completed' },
        });

        for (const edge of activeOutgoing) activeEdges.add(edge.id);
      } catch (error) {
        const elapsedMs = Math.max(0, Math.round(performance.now() - nodeStartedAt));
        if (input.signal.aborted) {
          await input.observer?.onNodeFailed?.(nodeId, new Error('运行已停止'), elapsedMs);
          this.emit(input.emit, {
            event: 'node_finished',
            data: { nodeId, outputs: {}, elapsedMs, status: 'stopped' },
          });
          return this.finishStopped(input, outputs, startedAt);
        }
        const normalized = error instanceof Error ? error : new Error(errorMessage(error));
        await input.observer?.onNodeFailed?.(nodeId, normalized, elapsedMs);
        this.emit(input.emit, {
          event: 'node_failed',
          data: { nodeId, error: errorMessage(error) },
        });
        this.emit(input.emit, {
          event: 'workflow_failed',
          data: { runId: input.runId, error: errorMessage(error), failedNodeId: nodeId },
        });
        throw new WorkflowNodeExecutionError(nodeId, error);
      }
    }

    const totalElapsedMs = Math.max(0, Math.round(performance.now() - startedAt));
    if (!terminalExecuted) {
      const error = new Error('工作流未执行到结束节点');
      this.emit(input.emit, {
        event: 'workflow_failed',
        data: { runId: input.runId, error: error.message },
      });
      throw error;
    }
    this.emit(input.emit, {
      event: 'workflow_finished',
      data: { runId: input.runId, outputs, totalElapsedMs, status: 'completed' },
    });
    return { outputs, totalElapsedMs, status: 'completed' };
  }

  private finishStopped(
    input: WorkflowExecutionInput,
    outputs: Record<string, unknown>,
    startedAt: number,
  ): WorkflowExecutionResult {
    const totalElapsedMs = Math.max(0, Math.round(performance.now() - startedAt));
    this.emit(input.emit, {
      event: 'workflow_finished',
      data: { runId: input.runId, outputs, totalElapsedMs, status: 'stopped' },
    });
    return { outputs, totalElapsedMs, status: 'stopped' };
  }

  private emit(send: (event: WorkflowRunEvent) => void, event: WorkflowRunEvent): void {
    send(WorkflowRunEventSchema.parse(event));
  }
}
