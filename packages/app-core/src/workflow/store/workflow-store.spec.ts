import { beforeEach, describe, expect, it } from 'vitest';
import { loadWorkflowGraph, useWorkflowStore } from './workflow-store';

const graph = {
  nodes: [
    {
      id: 'start',
      type: 'custom-node' as const,
      position: { x: 0, y: 0 },
      data: {
        type: 'start' as const,
        title: '开始',
        config: { fields: [{ name: 'query', type: 'string', required: true }] },
      },
    },
    {
      id: 'end',
      type: 'custom-node' as const,
      position: { x: 10, y: 10 },
      data: {
        type: 'end' as const,
        config: { outputs: [{ name: 'result', selector: ['start', 'query'] }] },
      },
    },
  ],
  edges: [{ id: 'edge', source: 'start', target: 'end' }],
  viewport: { x: 0, y: 0, zoom: 1 },
};

beforeEach(() => loadWorkflowGraph(graph));

describe('workflow store', () => {
  it('处理画布修改、选择、配置、标题和保存状态', () => {
    const store = useWorkflowStore.getState();
    store.selectNode('start');
    expect(useWorkflowStore.getState()).toMatchObject({
      selectedNodeId: 'start',
      panelOpen: true,
    });
    store.updateNodeTitle('start', '新开始');
    store.updateNodeConfig('start', { fields: [] });
    store.onNodesChange([{ type: 'position', id: 'start', position: { x: 3, y: 4 } }]);
    store.onEdgesChange([{ type: 'select', id: 'edge', selected: true }]);
    store.setEdges([]);
    store.setViewport({ x: 2, y: 3, zoom: 0.5 });
    expect(useWorkflowStore.getState().nodes[0]).toMatchObject({
      position: { x: 3, y: 4 },
      data: { title: '新开始', config: { fields: [] } },
    });
    expect(useWorkflowStore.getState().dirty).toBe(true);
    useWorkflowStore.getState().markSaved();
    expect(useWorkflowStore.getState().dirty).toBe(false);
    useWorkflowStore.getState().selectNode(null);
    expect(useWorkflowStore.getState().panelOpen).toBe(false);
  });

  it('选择节点不标记脏状态，条件分支删除时不把边错绑到其他出口', () => {
    const condition = {
      id: 'condition',
      type: 'custom-node' as const,
      position: { x: 5, y: 5 },
      data: {
        type: 'if-else' as const,
        config: {
          cases: [
            {
              branch: 'yes',
              logicalOperator: 'and',
              conditions: [{ left: ['start', 'query'], operator: 'is-not-empty' }],
            },
            {
              branch: 'maybe',
              logicalOperator: 'and',
              conditions: [{ left: ['start', 'query'], operator: 'is-not-empty' }],
            },
          ],
          defaultBranch: 'no',
        },
      },
    };
    useWorkflowStore.setState({
      nodes: [...graph.nodes, condition],
      edges: [
        { id: 'yes', source: 'condition', target: 'end', sourceHandle: 'yes' },
        { id: 'maybe', source: 'condition', target: 'end', sourceHandle: 'maybe' },
        { id: 'no', source: 'condition', target: 'end', sourceHandle: 'no' },
      ],
      dirty: false,
    });
    useWorkflowStore.getState().onNodesChange([{ type: 'select', id: 'start', selected: true }]);
    expect(useWorkflowStore.getState().dirty).toBe(false);
    useWorkflowStore.getState().updateNodeConfig('condition', {
      cases: [condition.data.config.cases[0]],
      defaultBranch: 'no',
    });
    expect(useWorkflowStore.getState().edges.map((edge) => edge.sourceHandle)).toEqual([
      'yes',
      'no',
    ]);
  });

  it('保存最多 20 份快照并支持撤销重做', () => {
    const store = useWorkflowStore.getState();
    useWorkflowStore.setState((state) => ({
      nodes: state.nodes.map((node) => ({
        ...node,
        data: { ...node.data, _runningStatus: 'running' },
      })),
    }));
    store.recordSnapshot();
    expect(useWorkflowStore.getState().past[0]?.nodes[0]?.data._runningStatus).toBeUndefined();
    useWorkflowStore.setState({ past: [], future: [] });
    for (let index = 0; index < 22; index += 1) {
      useWorkflowStore.setState({ viewport: { x: index, y: 0, zoom: 1 } });
      store.recordSnapshot();
    }
    expect(useWorkflowStore.getState().past).toHaveLength(20);
    useWorkflowStore.setState({ viewport: { x: 99, y: 0, zoom: 1 } });
    store.undo();
    expect(useWorkflowStore.getState().viewport.x).toBe(21);
    store.redo();
    expect(useWorkflowStore.getState().viewport.x).toBe(99);
    loadWorkflowGraph(graph);
    useWorkflowStore.getState().undo();
    useWorkflowStore.getState().redo();
    expect(useWorkflowStore.getState().viewport.x).toBe(0);
  });

  it('覆盖全部运行事件、失败和复位路径', () => {
    const apply = useWorkflowStore.getState().applyRuntimeEvent;
    apply({
      event: 'workflow_started',
      data: {
        runId: '11111111-1111-4111-8111-111111111111',
        graphSnapshot: graph,
      },
    });
    apply({ event: 'node_started', data: { nodeId: 'start', inputs: { query: 'a' } } });
    apply({ event: 'node_stream_chunk', data: { nodeId: 'start', text: 'a' } });
    apply({
      event: 'node_finished',
      data: { nodeId: 'start', outputs: { query: 'a' }, elapsedMs: 1, status: 'completed' },
    });
    apply({ event: 'node_started', data: { nodeId: 'end', inputs: {} } });
    apply({ event: 'node_failed', data: { nodeId: 'end', error: '失败' } });
    apply({
      event: 'workflow_failed',
      data: {
        runId: '11111111-1111-4111-8111-111111111111',
        error: '失败',
        failedNodeId: 'end',
      },
    });
    expect(useWorkflowStore.getState()).toMatchObject({
      running: false,
      workflowStatus: 'failed',
    });
    expect(useWorkflowStore.getState().logs.at(-1)).toMatchObject({
      status: 'failed',
      error: '失败',
    });
    apply({
      event: 'workflow_finished',
      data: {
        runId: '11111111-1111-4111-8111-111111111111',
        outputs: {},
        totalElapsedMs: 3,
        status: 'stopped',
      },
    });
    expect(useWorkflowStore.getState().workflowStatus).toBe('stopped');
    useWorkflowStore.getState().resetRuntime();
    expect(useWorkflowStore.getState()).toMatchObject({
      logs: [],
      workflowStatus: 'idle',
      runId: null,
    });
  });
});
