import { describe, expect, it } from 'vitest';
import type { WorkflowGraph, WorkflowRunEvent } from '@ai-engine/contracts';
import { FakeLlmGateway } from '../llm/fake-llm-gateway';
import { WorkflowEngine } from './engine/workflow-engine';
import { EndNodeRunner } from './nodes/end.runner';
import { LlmNodeRunner } from './nodes/llm.runner';
import { NodeRegistry } from './nodes/registry';
import { StartNodeRunner } from './nodes/start.runner';
import { InMemoryWorkflowRepository } from './workflow.repository';
import { WorkflowService } from './workflow.service';

const graph: WorkflowGraph = {
  nodes: [
    {
      id: 'start',
      type: 'custom-node',
      position: { x: 0, y: 0 },
      data: {
        type: 'start',
        config: { fields: [{ name: 'query', type: 'string', required: true }] },
      },
    },
    {
      id: 'llm',
      type: 'custom-node',
      position: { x: 1, y: 0 },
      data: { type: 'llm', config: { prompt: '{{#start.query#}}' } },
    },
    {
      id: 'end',
      type: 'custom-node',
      position: { x: 2, y: 0 },
      data: {
        type: 'end',
        config: { outputs: [{ name: 'answer', selector: ['llm', 'text'] }] },
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'llm' },
    { id: 'e2', source: 'llm', target: 'end' },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
};

const graphNode = (id: string) => {
  const node = graph.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`测试图缺少 ${id} 节点`);
  return node;
};

const setup = () => {
  const gateway = new FakeLlmGateway();
  const repository = new InMemoryWorkflowRepository();
  const registry = new NodeRegistry([
    new StartNodeRunner(),
    new LlmNodeRunner(gateway),
    new EndNodeRunner(),
  ]);
  const service = new WorkflowService(repository, new WorkflowEngine(registry), registry);
  return { gateway, repository, service };
};

describe('WorkflowService', () => {
  it('执行 start → llm → end，持久化节点记录并发送完整 SSE 序列', async () => {
    const { gateway, repository, service } = setup();
    gateway.enqueueStream([
      { event: 'chunk', data: { text: '答案' } },
      { event: 'done', data: { finishReason: 'stop' } },
    ]);
    const workflow = await service.createWorkflow({ name: '问答', graph });
    const events: WorkflowRunEvent[] = [];
    await service.stream(
      workflow.id,
      { inputs: { query: '问题' } },
      new AbortController().signal,
      (event) => events.push(event),
    );
    const started = events.find((event) => event.event === 'workflow_started');
    if (!started || started.event !== 'workflow_started') throw new Error('缺少开始事件');
    expect(await repository.getRun(started.data.runId)).toMatchObject({
      status: 'completed',
      outputs: { answer: '答案' },
    });
    expect(await repository.listNodeRuns(started.data.runId)).toHaveLength(3);
    expect(await service.listRuns(workflow.id)).toMatchObject({
      runs: [{ id: started.data.runId, graphSnapshot: graph, finishedAt: expect.any(String) }],
    });
    expect(await service.getRun(started.data.runId)).toMatchObject({
      run: { status: 'completed', error: null },
      nodeRuns: [{ nodeId: 'start' }, { nodeId: 'llm' }, { nodeId: 'end' }],
    });
    expect(events.at(-1)).toMatchObject({
      event: 'workflow_finished',
      data: { outputs: { answer: '答案' }, status: 'completed' },
    });
  });

  it('停止运行时中断 LLM 并将运行和节点记录标记为 stopped', async () => {
    const { repository, service } = setup();
    const workflow = await service.createWorkflow({ name: '可停止', graph });
    const events: WorkflowRunEvent[] = [];
    let runId = '';
    await service.stream(
      workflow.id,
      { inputs: { query: '问题' } },
      new AbortController().signal,
      (event) => {
        events.push(event);
        if (event.event === 'workflow_started') runId = event.data.runId;
        if (event.event === 'node_started' && event.data.nodeId === 'llm') {
          expect(service.stop(runId)).toEqual({ accepted: true });
          expect(service.stop(runId)).toEqual({ accepted: false });
        }
      },
    );
    expect(await repository.getRun(runId)).toMatchObject({ status: 'stopped' });
    expect(await repository.listNodeRuns(runId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ nodeId: 'llm', status: 'stopped' })]),
    );
    expect(events.at(-1)).toMatchObject({
      event: 'workflow_finished',
      data: { status: 'stopped' },
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'node_finished',
        data: expect.objectContaining({ nodeId: 'llm', status: 'stopped' }),
      }),
    );
    expect(service.stop(runId)).toEqual({ accepted: false });
  });

  it('客户端在监听注册前已断开时仍立即停止运行', async () => {
    const { repository, service } = setup();
    const workflow = await service.createWorkflow({ name: '已断开', graph });
    const disconnected = new AbortController();
    disconnected.abort(new Error('连接关闭'));
    let runId = '';
    await service.stream(
      workflow.id,
      { inputs: { query: '问题' } },
      disconnected.signal,
      (event) => {
        if (event.event === 'workflow_started') runId = event.data.runId;
      },
    );
    expect(await repository.getRun(runId)).toMatchObject({
      status: 'stopped',
      finishedAt: expect.any(Date),
    });
  });

  it('节点失败时持久化运行级错误和完成时间', async () => {
    const { gateway, repository, service } = setup();
    gateway.enqueueStream([{ event: 'error', data: { message: '模型不可用' } }]);
    const workflow = await service.createWorkflow({ name: '失败流', graph });
    let runId = '';
    await service.stream(
      workflow.id,
      { inputs: { query: '问题' } },
      new AbortController().signal,
      (event) => {
        if (event.event === 'workflow_started') runId = event.data.runId;
      },
    );
    expect(await repository.getRun(runId)).toMatchObject({
      status: 'failed',
      error: '节点 llm 执行失败',
      finishedAt: expect.any(Date),
    });
  });

  it('运行记录基础设施失败时仍发送且只发送一个终止事件', async () => {
    class FailingNodeRunRepository extends InMemoryWorkflowRepository {
      override async createNodeRun(): Promise<never> {
        await Promise.resolve();
        throw new Error('节点记录写入失败');
      }
    }
    const repository = new FailingNodeRunRepository();
    const registry = new NodeRegistry([new StartNodeRunner(), new EndNodeRunner()]);
    const service = new WorkflowService(repository, new WorkflowEngine(registry), registry);
    const minimalGraph: WorkflowGraph = {
      nodes: [graphNode('start'), graphNode('end')],
      edges: [{ id: 'edge', source: 'start', target: 'end' }],
      viewport: graph.viewport,
    };
    const workflow = await service.createWorkflow({ name: '记录失败', graph: minimalGraph });
    const events: WorkflowRunEvent[] = [];
    await service.stream(
      workflow.id,
      { inputs: { query: '问题' } },
      new AbortController().signal,
      (event) => events.push(event),
    );
    expect(
      events.filter(
        (event) => event.event === 'workflow_finished' || event.event === 'workflow_failed',
      ),
    ).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ event: 'workflow_failed' });
  });

  it('停止期间节点记录更新失败也保持 stopped 语义', async () => {
    class FailingStopRepository extends InMemoryWorkflowRepository {
      override async updateNodeRun(
        id: string,
        patch: Parameters<InMemoryWorkflowRepository['updateNodeRun']>[1],
      ): Promise<void> {
        if (patch.status === 'stopped') throw new Error('停止状态写入失败');
        return super.updateNodeRun(id, patch);
      }
    }
    const gateway = new FakeLlmGateway();
    const repository = new FailingStopRepository();
    const registry = new NodeRegistry([
      new StartNodeRunner(),
      new LlmNodeRunner(gateway),
      new EndNodeRunner(),
    ]);
    const service = new WorkflowService(repository, new WorkflowEngine(registry), registry);
    const workflow = await service.createWorkflow({ name: '停止记录失败', graph });
    const events: WorkflowRunEvent[] = [];
    let runId = '';
    await service.stream(
      workflow.id,
      { inputs: { query: '问题' } },
      new AbortController().signal,
      (event) => {
        events.push(event);
        if (event.event === 'workflow_started') runId = event.data.runId;
        if (event.event === 'node_started' && event.data.nodeId === 'llm') {
          service.stop(runId);
        }
      },
    );
    expect(await repository.getRun(runId)).toMatchObject({ status: 'stopped', error: null });
    expect(events.at(-1)).toMatchObject({
      event: 'workflow_finished',
      data: { status: 'stopped' },
    });
  });

  it('支持 CRUD、图校验和单节点调试', async () => {
    const { gateway, service } = setup();
    gateway.enqueueStream([
      { event: 'chunk', data: { text: '调试结果' } },
      { event: 'done', data: {} },
    ]);
    const workflow = await service.createWorkflow({ name: '原名', graph });
    expect(await service.listWorkflows()).toMatchObject({ workflows: [{ name: '原名' }] });
    expect(await service.updateWorkflow(workflow.id, { name: '新名' })).toMatchObject({
      name: '新名',
      version: 2,
    });
    expect(await service.validate(workflow.id)).toMatchObject({ valid: true });
    await expect(
      service.runNode(workflow.id, 'llm', {
        upstreamValues: { start: { query: '手动输入' } },
      }),
    ).resolves.toEqual({ outputs: { text: '调试结果' } });
    await service.deleteWorkflow(workflow.id);
    await expect(service.getWorkflow(workflow.id)).rejects.toThrow('NOT_FOUND');
  });
});
