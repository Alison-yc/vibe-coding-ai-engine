import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { NodeRunner } from './types';
import { NodeRegistry } from '../nodes/registry';
import { topologicalOrder, validateWorkflowGraph } from './graph-validator';
import type { NodeType, WorkflowGraph } from '@ai-engine/contracts';
import { IfElseNodeRunner } from '../nodes/if-else.runner';
import { VariableAssignerNodeRunner } from '../nodes/variable-assigner.runner';

const runner = (type: NodeType, role?: NodeRunner['role']): NodeRunner => ({
  type,
  role,
  configSchema: z.object({ selector: z.array(z.string()).optional() }),
  getValueSelectors: (config) => {
    const value = config as { selector?: string[] };
    return value.selector ? [value.selector] : [];
  },
  run: async () => ({ outputs: {} }),
});

const registry = new NodeRegistry([
  runner('start', 'entry'),
  runner('variable-assigner'),
  runner('end', 'terminal'),
]);

const validGraph = (): WorkflowGraph => ({
  nodes: [
    {
      id: 'start',
      type: 'custom-node',
      position: { x: 0, y: 0 },
      data: { type: 'start', config: {} },
    },
    {
      id: 'assign',
      type: 'custom-node',
      position: { x: 1, y: 0 },
      data: { type: 'variable-assigner', config: { selector: ['start', 'query'] } },
    },
    {
      id: 'end',
      type: 'custom-node',
      position: { x: 2, y: 0 },
      data: { type: 'end', config: { selector: ['assign', 'value'] } },
    },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'assign' },
    { id: 'e2', source: 'assign', target: 'end' },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
});

describe('validateWorkflowGraph', () => {
  it('接受有效图并给出稳定拓扑序', () => {
    const graph = validGraph();
    expect(validateWorkflowGraph(graph, registry)).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
    expect(topologicalOrder(graph)).toEqual(['start', 'assign', 'end']);
  });

  it('报告具体环路径与非法边', () => {
    const graph = validGraph();
    graph.edges.push({ id: 'cycle', source: 'end', target: 'start' });
    graph.edges.push({ id: 'missing', source: 'ghost', target: 'end' });
    const result = validateWorkflowGraph(graph, registry);
    expect(result.valid).toBe(false);
    expect(result.errors.find((item) => item.code === 'cycle')?.nodeIds).toEqual([
      'start',
      'assign',
      'end',
      'start',
    ]);
    expect(result.errors.some((item) => item.code === 'invalid-edge')).toBe(true);
  });

  it('在执行前拒绝重复节点、非法配置和不存在的变量来源', () => {
    const graph = validGraph();
    graph.nodes.push({
      id: 'assign',
      type: 'custom-node',
      position: { x: 3, y: 0 },
      data: { type: 'variable-assigner', config: {} },
    });
    const endNode = graph.nodes.find((node) => node.id === 'end');
    if (!endNode) throw new Error('测试图缺少 end 节点');
    endNode.data.config = { selector: ['ghost', 'value'] };
    const result = validateWorkflowGraph(graph, registry);
    expect(result.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining(['duplicate-node', 'invalid-variable-reference']),
    );
  });

  it('拒绝重复边以及引用自身或下游节点的变量', () => {
    const graph = validGraph();
    graph.edges.push({ id: 'e1', source: 'start', target: 'end' });
    const assignNode = graph.nodes.find((node) => node.id === 'assign');
    if (!assignNode) throw new Error('测试图缺少 assign 节点');
    assignNode.data.config = { selector: ['end', 'value'] };
    const result = validateWorkflowGraph(graph, registry);
    expect(result.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining(['duplicate-edge', 'invalid-variable-order']),
    );
  });

  it('报告未注册节点、起止节点数量与孤立节点警告', () => {
    const graph = validGraph();
    const startNode = graph.nodes.find((node) => node.id === 'start');
    if (!startNode) throw new Error('测试图缺少 start 节点');
    startNode.data.type = 'llm';
    graph.edges = [];
    const result = validateWorkflowGraph(graph, registry);
    expect(result.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining(['unregistered-node', 'entry-count']),
    );
    expect(result.warnings.map((item) => item.code)).toEqual(
      expect.arrayContaining(['isolated-node', 'dead-end']),
    );
  });

  it('识别有入边但整体无法从开始节点到达的子图', () => {
    const graph = validGraph();
    graph.nodes.push(
      {
        id: 'detached-a',
        type: 'custom-node',
        position: { x: 0, y: 2 },
        data: { type: 'variable-assigner', config: {} },
      },
      {
        id: 'detached-b',
        type: 'custom-node',
        position: { x: 1, y: 2 },
        data: { type: 'variable-assigner', config: {} },
      },
    );
    graph.edges.push({ id: 'detached-edge', source: 'detached-a', target: 'detached-b' });
    const result = validateWorkflowGraph(graph, registry);
    expect(
      result.warnings
        .filter((item) => item.code === 'isolated-node')
        .map((item) => item.nodeIds[0]),
    ).toEqual(expect.arrayContaining(['detached-a', 'detached-b']));
  });

  it('拒绝条件节点缺失分支 handle 的出边', () => {
    const graph = validGraph();
    const assignNode = graph.nodes.find((node) => node.id === 'assign');
    if (!assignNode) throw new Error('测试图缺少 assign 节点');
    assignNode.data = {
      type: 'if-else',
      config: {
        cases: [
          {
            branch: 'yes',
            conditions: [
              {
                left: ['sys', 'query'],
                operator: 'equals',
                right: { source: 'constant', value: 'yes' },
              },
            ],
          },
        ],
        defaultBranch: 'no',
      },
    };
    const branchRegistry = new NodeRegistry([
      runner('start', 'entry'),
      new IfElseNodeRunner(),
      runner('end', 'terminal'),
    ]);
    const result = validateWorkflowGraph(graph, branchRegistry);
    expect(result.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining(['invalid-branch-edge', 'missing-branch-edge']),
    );
  });

  it('校验变量赋值模板中的不存在来源', () => {
    const graph = validGraph();
    const assignNode = graph.nodes.find((node) => node.id === 'assign');
    if (!assignNode) throw new Error('测试图缺少 assign 节点');
    assignNode.data.config = {
      assignments: [
        {
          name: 'value',
          value: { source: 'template', template: '{{#ghost.text#}}' },
        },
      ],
    };
    const assignRegistry = new NodeRegistry([
      runner('start', 'entry'),
      new VariableAssignerNodeRunner(),
      runner('end', 'terminal'),
    ]);
    const result = validateWorkflowGraph(graph, assignRegistry);
    expect(result.errors.map((item) => item.code)).toContain('invalid-variable-reference');
  });
});
