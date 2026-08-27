import { describe, expect, it } from 'vitest';
import {
  CodeNodeConfigSchema,
  CreateWorkflowRequestSchema,
  IfElseNodeConfigSchema,
  NodeTypeSchema,
  RunNodeRequestSchema,
  RunWorkflowRequestSchema,
  StopWorkflowResponseSchema,
  UpdateWorkflowRequestSchema,
  WorkflowRunEventSchema,
  WorkflowRunDetailResponseSchema,
  WorkflowRunListResponseSchema,
  WorkflowValidationResponseSchema,
  selectorFromTemplateMatch,
} from './index.js';

const graph = {
  nodes: [
    { id: 'start', data: { type: 'start', config: { fields: [] } } },
    {
      id: 'end',
      data: {
        type: 'end',
        config: { outputs: [{ name: 'result', selector: ['start', 'query'] }] },
      },
    },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'end' }],
};

describe('workflow contracts', () => {
  it('接受完整工作流与默认运行输入', () => {
    const parsed = CreateWorkflowRequestSchema.parse({ name: '最小工作流', graph });
    expect(parsed.graph.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(parsed.graph.nodes[0]?.type).toBe('custom-node');
    expect(RunWorkflowRequestSchema.parse({})).toEqual({ inputs: {} });
    expect(RunNodeRequestSchema.parse({})).toEqual({ upstreamValues: {} });
    expect(StopWorkflowResponseSchema.parse({ accepted: true })).toEqual({ accepted: true });
    expect(UpdateWorkflowRequestSchema.safeParse({}).success).toBe(false);
    expect(UpdateWorkflowRequestSchema.parse({ name: '新名称' })).toEqual({ name: '新名称' });
    expect(selectorFromTemplateMatch('node.output.text')).toEqual(['node', 'output', 'text']);
    const run = {
      id: '00000000-0000-4000-8000-000000000001',
      workflowId: '00000000-0000-4000-8000-000000000002',
      status: 'completed',
      inputs: {},
      outputs: {},
      graphSnapshot: parsed.graph,
      error: null,
      startedAt: '2026-08-27T00:00:00.000Z',
      finishedAt: '2026-08-27T00:00:01.000Z',
    };
    expect(WorkflowRunListResponseSchema.parse({ runs: [run] }).runs).toHaveLength(1);
    expect(
      WorkflowRunDetailResponseSchema.parse({
        run,
        nodeRuns: [
          {
            id: '00000000-0000-4000-8000-000000000003',
            runId: run.id,
            nodeId: 'start',
            status: 'completed',
            inputs: {},
            outputs: {},
            elapsedMs: 1,
            error: null,
            createdAt: run.startedAt,
          },
        ],
      }).nodeRuns,
    ).toHaveLength(1);
  });

  it('拒绝未知节点、非法条件与空代码', () => {
    expect(NodeTypeSchema.safeParse('unknown').success).toBe(false);
    expect(
      IfElseNodeConfigSchema.safeParse({
        cases: [{ branch: 'yes', conditions: [] }],
        defaultBranch: 'no',
      }).success,
    ).toBe(false);
    expect(CodeNodeConfigSchema.safeParse({ code: '', inputs: {} }).success).toBe(false);
  });

  it('校验运行事件与图校验响应', () => {
    expect(
      WorkflowRunEventSchema.parse({
        event: 'node_stream_chunk',
        data: { nodeId: 'llm', text: '片段' },
      }),
    ).toMatchObject({ event: 'node_stream_chunk' });
    expect(
      WorkflowValidationResponseSchema.parse({
        valid: false,
        errors: [{ code: 'cycle', message: '存在循环', nodeIds: ['a', 'b', 'a'] }],
        warnings: [],
      }).errors[0]?.nodeIds,
    ).toEqual(['a', 'b', 'a']);
  });
});
