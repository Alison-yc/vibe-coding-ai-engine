import { describe, expect, it, vi } from 'vitest';
import type { NodeRunner } from './types';
import { NodeRegistry } from '../nodes/registry';
import { WorkflowEngine, WorkflowGraphValidationError } from './workflow-engine';
import type { NodeType, WorkflowGraph, WorkflowRunEvent } from '@ai-engine/contracts';
import { z } from 'zod';

const createRunner = (
  type: NodeType,
  run: NodeRunner['run'],
  role?: NodeRunner['role'],
): NodeRunner => ({ type, role, configSchema: z.unknown(), run });

const graph: WorkflowGraph = {
  nodes: [
    {
      id: 'start',
      type: 'custom-node',
      position: { x: 0, y: 0 },
      data: { type: 'start', config: {} },
    },
    {
      id: 'branch',
      type: 'custom-node',
      position: { x: 1, y: 0 },
      data: { type: 'if-else', config: {} },
    },
    {
      id: 'yes',
      type: 'custom-node',
      position: { x: 2, y: 0 },
      data: { type: 'variable-assigner', config: { value: 'yes' } },
    },
    {
      id: 'no',
      type: 'custom-node',
      position: { x: 2, y: 1 },
      data: { type: 'variable-assigner', config: { value: 'no' } },
    },
    {
      id: 'end',
      type: 'custom-node',
      position: { x: 3, y: 0 },
      data: { type: 'end', config: {} },
    },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'branch' },
    { id: 'e2', source: 'branch', target: 'yes', sourceHandle: 'yes' },
    { id: 'e3', source: 'branch', target: 'no', sourceHandle: 'no' },
    { id: 'e4', source: 'yes', target: 'end' },
    { id: 'e5', source: 'no', target: 'end' },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
};

const nodeById = (id: string) => {
  const node = graph.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`测试图缺少 ${id} 节点`);
  return node;
};

describe('WorkflowEngine', () => {
  it('串行执行活动分支并发送完整事件', async () => {
    const visited: string[] = [];
    const registry = new NodeRegistry([
      createRunner(
        'start',
        async (_config, pool) => ({ outputs: { query: pool.getSystem('query') } }),
        'entry',
      ),
      createRunner('if-else', async () => ({ outputs: {}, nextBranch: 'yes' })),
      createRunner('variable-assigner', async (config) => {
        const value =
          typeof config === 'object' && config !== null && 'value' in config
            ? config.value
            : undefined;
        visited.push(String(value));
        return { outputs: { value } };
      }),
      createRunner(
        'end',
        async (_config, pool) => ({ outputs: { result: pool.get(['yes', 'value']) } }),
        'terminal',
      ),
    ]);
    const events: WorkflowRunEvent[] = [];
    const observer = { onNodeFinished: vi.fn() };
    const result = await new WorkflowEngine(registry).execute({
      runId: '00000000-0000-4000-8000-000000000001',
      graph,
      inputs: { query: '问题' },
      signal: new AbortController().signal,
      emit: (event) => events.push(event),
      observer,
    });
    expect(result).toMatchObject({ outputs: { result: 'yes' }, status: 'completed' });
    expect(visited).toEqual(['yes']);
    expect(events.map((event) => event.event)).toEqual([
      'workflow_started',
      'node_started',
      'node_finished',
      'node_started',
      'node_finished',
      'node_started',
      'node_finished',
      'node_started',
      'node_finished',
      'workflow_finished',
    ]);
    expect(observer.onNodeFinished).toHaveBeenCalledTimes(4);
  });

  it('在执行前拒绝有环图', async () => {
    const registry = new NodeRegistry([
      createRunner('start', async () => ({ outputs: {} }), 'entry'),
      createRunner('if-else', async () => ({ outputs: {} })),
      createRunner('variable-assigner', async () => ({ outputs: {} })),
      createRunner('end', async () => ({ outputs: {} }), 'terminal'),
    ]);
    const cyclic = structuredClone(graph);
    cyclic.edges.push({ id: 'cycle', source: 'end', target: 'start' });
    await expect(
      new WorkflowEngine(registry).execute({
        runId: '00000000-0000-4000-8000-000000000001',
        graph: cyclic,
        inputs: {},
        signal: new AbortController().signal,
        emit: () => undefined,
      }),
    ).rejects.toBeInstanceOf(WorkflowGraphValidationError);
  });

  it('节点失败时发送失败事件并通知 observer', async () => {
    const failingGraph: WorkflowGraph = {
      nodes: [nodeById('start'), nodeById('end')],
      edges: [{ id: 'edge', source: 'start', target: 'end' }],
      viewport: graph.viewport,
    };
    const registry = new NodeRegistry([
      createRunner(
        'start',
        async () => {
          throw new Error('失败');
        },
        'entry',
      ),
      createRunner('end', async () => ({ outputs: {} }), 'terminal'),
    ]);
    const events: WorkflowRunEvent[] = [];
    const onNodeFailed = vi.fn();
    await expect(
      new WorkflowEngine(registry).execute({
        runId: '00000000-0000-4000-8000-000000000001',
        graph: failingGraph,
        inputs: {},
        signal: new AbortController().signal,
        emit: (event) => events.push(event),
        observer: { onNodeFailed },
      }),
    ).rejects.toThrow('节点 start 执行失败');
    expect(onNodeFailed).toHaveBeenCalledOnce();
    expect(events.slice(-2).map((event) => event.event)).toEqual([
      'node_failed',
      'workflow_failed',
    ]);
  });

  it('节点返回未配置的分支时失败而不是静默完成', async () => {
    const registry = new NodeRegistry([
      createRunner('start', async () => ({ outputs: {} }), 'entry'),
      createRunner('if-else', async () => ({ outputs: {}, nextBranch: 'missing' })),
      createRunner('variable-assigner', async () => ({ outputs: {} })),
      createRunner('end', async () => ({ outputs: {} }), 'terminal'),
    ]);
    const events: WorkflowRunEvent[] = [];
    await expect(
      new WorkflowEngine(registry).execute({
        runId: '00000000-0000-4000-8000-000000000001',
        graph,
        inputs: {},
        signal: new AbortController().signal,
        emit: (event) => events.push(event),
      }),
    ).rejects.toThrow('节点 branch 执行失败');
    expect(events.at(-1)).toMatchObject({
      event: 'workflow_failed',
      data: { failedNodeId: 'branch' },
    });
  });

  it('活动分支未抵达结束节点时失败', async () => {
    const deadEndGraph = structuredClone(graph);
    deadEndGraph.edges = deadEndGraph.edges.filter((edge) => edge.id !== 'e4');
    const registry = new NodeRegistry([
      createRunner('start', async () => ({ outputs: {} }), 'entry'),
      createRunner('if-else', async () => ({ outputs: {}, nextBranch: 'yes' })),
      createRunner('variable-assigner', async () => ({ outputs: {} })),
      createRunner('end', async () => ({ outputs: {} }), 'terminal'),
    ]);
    const events: WorkflowRunEvent[] = [];
    await expect(
      new WorkflowEngine(registry).execute({
        runId: '00000000-0000-4000-8000-000000000001',
        graph: deadEndGraph,
        inputs: {},
        signal: new AbortController().signal,
        emit: (event) => events.push(event),
      }),
    ).rejects.toThrow('未执行到结束节点');
    expect(events.at(-1)).toMatchObject({ event: 'workflow_failed' });
  });

  it('已取消的运行发送 stopped 终止事件', async () => {
    const controller = new AbortController();
    controller.abort();
    const registry = new NodeRegistry([
      createRunner('start', async () => ({ outputs: {} }), 'entry'),
      createRunner('end', async () => ({ outputs: {} }), 'terminal'),
    ]);
    const events: WorkflowRunEvent[] = [];
    const result = await new WorkflowEngine(registry).execute({
      runId: '00000000-0000-4000-8000-000000000001',
      graph: {
        nodes: [nodeById('start'), nodeById('end')],
        edges: [{ id: 'edge', source: 'start', target: 'end' }],
        viewport: graph.viewport,
      },
      inputs: {},
      signal: controller.signal,
      emit: (event) => events.push(event),
    });
    expect(result.status).toBe('stopped');
    expect(events.at(-1)).toMatchObject({
      event: 'workflow_finished',
      data: { status: 'stopped' },
    });
  });
});
