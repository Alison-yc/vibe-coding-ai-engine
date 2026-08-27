import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryKeyValueStore, type Platform } from '@ai-engine/platform';
import {
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  getWorkflowRun,
  listWorkflowRuns,
  listWorkflows,
  runWorkflowNode,
  stopWorkflowRun,
  streamWorkflow,
  updateWorkflow,
  validateWorkflow,
} from './workflow-api';

const platform = {
  capabilities: {
    nativeDirectoryPicker: false,
    windowControls: false,
    routerMode: 'history',
    devTools: true,
  },
  pickDirectory: async () => null,
  pickFiles: async () => [],
  kv: createMemoryKeyValueStore(),
  getApiBaseUrl: () => 'http://localhost:3000/',
  openExternal: async () => undefined,
  getAppInfo: async () => ({ name: 'test', version: '0' }),
  getSystemTheme: () => 'light',
  subscribeSystemTheme: () => () => undefined,
  window: {
    minimize: async () => undefined,
    maximize: async () => undefined,
    close: async () => undefined,
    reload: async () => undefined,
  },
} satisfies Platform;

const workflowId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const graph = {
  nodes: [
    {
      id: 'start',
      type: 'custom-node' as const,
      position: { x: 0, y: 0 },
      data: { type: 'start' as const, config: { fields: [] } },
    },
    {
      id: 'end',
      type: 'custom-node' as const,
      position: { x: 1, y: 1 },
      data: {
        type: 'end' as const,
        config: { outputs: [{ name: 'result', selector: ['start', 'query'] }] },
      },
    },
  ],
  edges: [{ id: 'edge', source: 'start', target: 'end' }],
  viewport: { x: 0, y: 0, zoom: 1 },
};
const workflow = {
  id: workflowId,
  name: '测试',
  graph,
  version: 1,
  createdAt: '2026-08-28T00:00:00.000Z',
};
const run = {
  id: runId,
  workflowId,
  status: 'completed',
  inputs: {},
  outputs: {},
  graphSnapshot: graph,
  error: null,
  startedAt: '2026-08-28T00:00:00.000Z',
  finishedAt: '2026-08-28T00:00:01.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('workflow api', () => {
  it('解析工作流 CRUD、校验、运行记录、停止和节点调试响应', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: { method?: string }) => {
      const url = String(input);
      if (url.endsWith('/workflows') && !init?.method)
        return Response.json({ workflows: [workflow] });
      if (url.endsWith('/workflows') && init?.method === 'POST') return Response.json(workflow);
      if (url.endsWith(`/workflows/${workflowId}`) && !init?.method) return Response.json(workflow);
      if (url.endsWith(`/workflows/${workflowId}`) && init?.method === 'PATCH')
        return Response.json({ ...workflow, version: 2 });
      if (url.endsWith('/validate'))
        return Response.json({ valid: true, errors: [], warnings: [] });
      if (url.endsWith(`/${workflowId}/runs`)) return Response.json({ runs: [run] });
      if (url.endsWith(`/runs/${runId}`))
        return Response.json({
          run,
          nodeRuns: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              runId,
              nodeId: 'start',
              status: 'completed',
              inputs: {},
              outputs: {},
              elapsedMs: 1,
              error: null,
              createdAt: '2026-08-28T00:00:00.000Z',
            },
          ],
        });
      if (url.endsWith('/stop')) return Response.json({ accepted: true });
      if (url.endsWith('/nodes/start/run')) return Response.json({ outputs: { query: 'a' } });
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json({ message: '未匹配' }, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(listWorkflows(platform)).resolves.toHaveLength(1);
    await expect(createWorkflow(platform, { name: '测试', graph })).resolves.toMatchObject({
      id: workflowId,
    });
    await expect(getWorkflow(platform, workflowId)).resolves.toMatchObject({ name: '测试' });
    await expect(updateWorkflow(platform, workflowId, { name: '新名称' })).resolves.toMatchObject({
      version: 2,
    });
    await expect(validateWorkflow(platform, workflowId, graph)).resolves.toMatchObject({
      valid: true,
    });
    await expect(listWorkflowRuns(platform, workflowId)).resolves.toHaveLength(1);
    await expect(getWorkflowRun(platform, runId)).resolves.toMatchObject({
      nodeRuns: [{ nodeId: 'start' }],
    });
    await expect(stopWorkflowRun(platform, runId)).resolves.toBe(true);
    await expect(
      runWorkflowNode(platform, workflowId, 'start', { upstreamValues: {} }),
    ).resolves.toMatchObject({ outputs: { query: 'a' } });
    await expect(deleteWorkflow(platform, workflowId)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('读取 SSE 且忽略损坏事件', async () => {
    const body = [
      `event: workflow_started\ndata: ${JSON.stringify({ runId, graphSnapshot: graph })}\n\n`,
      'event: broken\ndata: {\n\n',
      `event: workflow_finished\ndata: ${JSON.stringify({ runId, outputs: {}, totalElapsedMs: 1, status: 'completed' })}`,
    ].join('');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200 })),
    );
    const events: string[] = [];
    await streamWorkflow(
      platform,
      workflowId,
      { inputs: {} },
      new AbortController().signal,
      (event) => events.push(event.event),
    );
    expect(events).toEqual(['workflow_started', 'workflow_finished']);
  });

  it('把 workflow_failed 识别为正常的失败终态', async () => {
    const body = `event: workflow_failed\ndata: ${JSON.stringify({ runId, error: '节点失败' })}`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200 })),
    );
    const events: string[] = [];
    await streamWorkflow(
      platform,
      workflowId,
      { inputs: {} },
      new AbortController().signal,
      (event) => events.push(event.event),
    );
    expect(events).toEqual(['workflow_failed']);
  });

  it('把服务端错误消息暴露给调用方，并处理无 body 或意外中断的流响应', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ message: '图无效' }, { status: 400 })),
    );
    await expect(getWorkflow(platform, workflowId)).rejects.toThrow('图无效');
    await expect(
      streamWorkflow(platform, workflowId, { inputs: {} }, new AbortController().signal, () => {}),
    ).rejects.toThrow('图无效');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    await expect(
      streamWorkflow(platform, workflowId, { inputs: {} }, new AbortController().signal, () => {}),
    ).rejects.toThrow('没有 body');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('event: broken\ndata: {}', { status: 200 })),
    );
    await expect(
      streamWorkflow(platform, workflowId, { inputs: {} }, new AbortController().signal, () => {}),
    ).rejects.toThrow('意外中断');
  });
});
