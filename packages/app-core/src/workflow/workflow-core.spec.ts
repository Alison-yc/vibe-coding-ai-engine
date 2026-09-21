import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { NodeTypeSchema, WorkflowGraphSchema } from '@ai-engine/contracts';
import { canConnectNodes, collectUpstreamNodeIds, syncSourceHandleEdges } from './graph-utils';
import { NodeDefinitions } from './nodes/registry';
import { applyRuntimeEvent } from './store/runtime-slice';
import { serializeWorkflowGraph } from './store/workflow-store';
import { variableOptionsForNode } from './variable-selector';
import type { CanvasEdge, CanvasNode } from './types';

const nodes: CanvasNode[] = [
  {
    id: 'start',
    type: 'custom-node',
    position: { x: 0, y: 0 },
    data: {
      type: 'start',
      title: '开始',
      config: { fields: [{ name: 'query', type: 'string', required: true }] },
      _runningStatus: 'running',
      _validationErrors: ['测试错误'],
    },
  },
  {
    id: 'llm',
    type: 'custom-node',
    position: { x: 100, y: 0 },
    data: { type: 'llm', config: { prompt: '{{#start.query#}}' } },
  },
  {
    id: 'end',
    type: 'custom-node',
    position: { x: 200, y: 0 },
    data: { type: 'end', config: { outputs: [{ name: 'result', selector: ['llm', 'text'] }] } },
  },
  {
    id: 'variable',
    type: 'custom-node',
    position: { x: 100, y: 100 },
    data: {
      type: 'variable-assigner',
      config: { assignments: [{ name: 'value', value: { source: 'constant', value: 1 } }] },
    },
  },
];
const edges: CanvasEdge[] = [
  { id: 'one', source: 'start', target: 'llm' },
  { id: 'two', source: 'llm', target: 'end' },
];
const t = ((key: string) => key) as TFunction<'workflow'>;

describe('工作流画布核心', () => {
  it('序列化时统一移除下划线开头的运行态字段', () => {
    const graph = serializeWorkflowGraph(nodes, edges, { x: 1, y: 2, zoom: 0.8 });
    expect(WorkflowGraphSchema.safeParse(graph).success).toBe(true);
    expect(graph.nodes[0]?.data).toEqual({
      type: 'start',
      title: '开始',
      config: { fields: [{ name: 'query', type: 'string', required: true }] },
    });
  });

  it('变量选择器只暴露当前节点的上游输出并能在有环输入上终止', () => {
    expect(
      collectUpstreamNodeIds('end', [...edges, { id: 'cycle', source: 'end', target: 'llm' }]),
    ).toEqual(new Set(['llm', 'start']));
    const options = variableOptionsForNode('llm', nodes, edges, t);
    expect(options.map((option) => option.selector.join('.'))).toEqual([
      'sys.query',
      'start.query',
    ]);
    expect(variableOptionsForNode('llm', nodes, [], t)).toEqual([]);
    expect(
      variableOptionsForNode(
        'llm',
        nodes.filter((node) => node.data.type !== 'start'),
        [],
        t,
      ),
    ).toEqual([]);
  });

  it('拒绝自环、重复边、结束节点出边、开始节点入边和成环连接', () => {
    expect(canConnectNodes({ source: 'llm', target: 'llm' }, nodes, edges)).toBe(false);
    expect(canConnectNodes({ source: 'start', target: 'llm' }, nodes, edges)).toBe(false);
    expect(canConnectNodes({ source: 'end', target: 'llm' }, nodes, edges)).toBe(false);
    expect(canConnectNodes({ source: 'llm', target: 'start' }, nodes, edges)).toBe(false);
    expect(canConnectNodes({ source: 'llm', target: 'start' }, nodes, [])).toBe(false);
    expect(canConnectNodes({ source: 'llm', target: 'end' }, nodes, [])).toBe(true);
    expect(canConnectNodes({ source: 'end', target: 'start' }, nodes, edges)).toBe(false);
    expect(
      canConnectNodes({ source: 'llm', target: 'variable' }, nodes, [
        { id: 'cycle-base', source: 'variable', target: 'llm' },
      ]),
    ).toBe(false);
  });

  it('条件分支改名或删除时同步已有 sourceHandle', () => {
    const branchEdges = [
      { id: 'yes', source: 'condition', target: 'end', sourceHandle: 'yes' },
      { id: 'no', source: 'condition', target: 'end', sourceHandle: 'no' },
    ];
    expect(
      syncSourceHandleEdges('condition', ['yes', 'no'], ['matched', 'no'], branchEdges),
    ).toEqual([{ ...branchEdges[0], sourceHandle: 'matched' }, branchEdges[1]]);
    expect(
      syncSourceHandleEdges(
        'condition',
        ['yes', 'no'],
        ['matched', 'no'],
        [{ id: 'plain', source: 'condition', target: 'end' }],
      ),
    ).toEqual([{ id: 'plain', source: 'condition', target: 'end' }]);
    expect(
      syncSourceHandleEdges(
        'condition',
        ['yes', 'maybe', 'no'],
        ['matched', 'no'],
        [
          ...branchEdges,
          { id: 'maybe', source: 'condition', target: 'end', sourceHandle: 'maybe' },
          { id: 'other', source: 'another', target: 'end', sourceHandle: 'maybe' },
        ],
      ),
    ).toEqual([
      branchEdges[1],
      { id: 'other', source: 'another', target: 'end', sourceHandle: 'maybe' },
    ]);
  });

  it('八类节点都通过单一注册表声明画布、面板和元数据', () => {
    expect(Object.keys(NodeDefinitions).sort()).toEqual([...NodeTypeSchema.options].sort());
    for (const definition of Object.values(NodeDefinitions)) {
      expect(definition.Body).toBeTypeOf('function');
      expect(definition.Panel).toBeTypeOf('function');
      expect(definition.defaultConfig).toBeTypeOf('object');
    }
  });

  it('SSE reducer 累积流式文本并更新节点终态', () => {
    const started = applyRuntimeEvent(
      { nodes, logs: [], runId: null, running: false, workflowStatus: 'idle' },
      {
        event: 'node_started',
        data: { nodeId: 'llm', inputs: { prompt: '你好' } },
      },
    );
    const chunked = applyRuntimeEvent(
      {
        nodes: started.nodes ?? nodes,
        logs: started.logs ?? [],
        runId: null,
        running: true,
        workflowStatus: 'running',
      },
      { event: 'node_stream_chunk', data: { nodeId: 'llm', text: '回答' } },
    );
    const finished = applyRuntimeEvent(
      {
        nodes: chunked.nodes ?? nodes,
        logs: chunked.logs ?? [],
        runId: null,
        running: true,
        workflowStatus: 'running',
      },
      {
        event: 'node_finished',
        data: { nodeId: 'llm', outputs: { text: '回答' }, elapsedMs: 12, status: 'completed' },
      },
    );
    expect(finished.logs?.[0]).toMatchObject({
      nodeId: 'llm',
      text: '回答',
      status: 'completed',
      elapsedMs: 12,
    });
    expect(finished.nodes?.find((node) => node.id === 'llm')?.data._runningStatus).toBe(
      'completed',
    );
  });
});
