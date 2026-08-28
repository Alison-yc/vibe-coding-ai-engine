// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createMemoryKeyValueStore, PlatformProvider, type Platform } from '@ai-engine/platform';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { createI18nOptions } from '../i18n/resources';
import { WorkflowListPage } from './workflow-list-page';
import { WorkflowEditorPage } from './workflow-editor-page';

vi.mock('../workflow/canvas/workflow-canvas', () => ({
  WorkflowCanvas: () => <div>测试画布</div>,
}));

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
  getApiBaseUrl: () => 'http://localhost:3000',
  getUiLocale: async () => 'en-US',
  setUiLocale: async () => undefined,
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
      type: 'custom-node',
      position: { x: 0, y: 0 },
      data: {
        type: 'start',
        title: '开始',
        config: { fields: [{ name: 'query', type: 'string', required: true }] },
      },
    },
    {
      id: 'end',
      type: 'custom-node',
      position: { x: 300, y: 0 },
      data: {
        type: 'end',
        title: '结束',
        config: { outputs: [{ name: 'result', selector: ['start', 'query'] }] },
      },
    },
  ],
  edges: [{ id: 'edge', source: 'start', target: 'end' }],
  viewport: { x: 0, y: 0, zoom: 1 },
};
const workflow = {
  id: workflowId,
  name: '页面测试工作流',
  graph,
  version: 1,
  createdAt: '2026-08-28T00:00:00.000Z',
};

const i18n = createInstance();
beforeAll(async () => {
  await i18n.init(createI18nOptions('en-US'));
});

const renderPage = (path: string, element: ReactNode) =>
  render(
    <PlatformProvider value={platform}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/workflow" element={path === '/workflow' ? element : null} />
              <Route path="/workflow/:id" element={path !== '/workflow' ? element : null} />
            </Routes>
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>
    </PlatformProvider>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('工作流页面', () => {
  it('列表页加载、创建、编辑和删除工作流', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: { method?: string }) => {
      const url = String(input);
      if (url.endsWith('/workflows') && !init?.method)
        return Response.json({ workflows: [workflow] });
      if (url.endsWith('/workflows') && init?.method === 'POST') return Response.json(workflow);
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json({ message: '未匹配' }, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage('/workflow', <WorkflowListPage />);
    expect(await screen.findByText('页面测试工作流')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    renderPage('/workflow', <WorkflowListPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'New workflow' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    renderPage('/workflow', <WorkflowListPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'DELETE')).toBe(true),
    );
  });

  it('编辑器加载、改名、保存校验并运行 SSE', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: { method?: string }) => {
      const url = new URL(String(input));
      if (!init?.method && url.pathname.endsWith('/runs')) return Response.json({ runs: [] });
      if (init?.method === 'POST' && url.pathname.endsWith('/validate'))
        return Response.json({ valid: true, errors: [], warnings: [] });
      if (init?.method === 'PATCH') return Response.json({ ...workflow, version: 2 });
      if (init?.method === 'POST' && url.pathname.endsWith('/run')) {
        return new Response(
          [
            `event: workflow_started\ndata: ${JSON.stringify({ runId, graphSnapshot: graph })}\n\n`,
            `event: workflow_finished\ndata: ${JSON.stringify({ runId, outputs: {}, totalElapsedMs: 2, status: 'completed' })}\n\n`,
          ].join(''),
          { status: 200 },
        );
      }
      return Response.json(workflow);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage(`/workflow/${workflowId}`, <WorkflowEditorPage />);
    const name = await screen.findByLabelText('Workflow name');
    fireEvent.change(name, { target: { value: '新工作流名称' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and validate' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'PATCH')).toBe(true),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run', exact: true }));
    fireEvent.change(screen.getByLabelText('query *'), { target: { value: '问题' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start run' }));
    expect(await screen.findByText('Succeeded')).toBeTruthy();
  });
});
