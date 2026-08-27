// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryKeyValueStore, PlatformProvider, type Platform } from '@ai-engine/platform';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAgentStore } from '../agent/agent-store';
import { AgentPage } from './agent-page';

const mocks = vi.hoisted(() => ({
  listSessions: vi.fn(),
  listMessages: vi.fn(),
  createSession: vi.fn(),
  streamAgent: vi.fn(),
  respondPermission: vi.fn(),
}));

vi.mock('../chat/chat-api', () => ({
  listChatSessions: mocks.listSessions,
  listChatMessages: mocks.listMessages,
  createChatSession: mocks.createSession,
}));

vi.mock('../agent/agent-api', () => ({
  streamAgent: mocks.streamAgent,
  respondAgentPermission: mocks.respondPermission,
}));

vi.mock('../theme-provider', () => ({
  useTheme: () => ({ preference: 'system', setPreference: vi.fn() }),
}));

const sessionId = '11111111-1111-4111-8111-111111111111';
const messageId = '22222222-2222-4222-8222-222222222222';
const approvalId = '33333333-3333-4333-8333-333333333333';

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

const renderPage = () =>
  render(
    <PlatformProvider value={platform}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={[`/agent/${sessionId}`]}>
          <Routes>
            <Route path="/agent/:sessionId" element={<AgentPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </PlatformProvider>,
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useAgentStore.setState({
    sessionId: null,
    messages: [],
    streaming: false,
    error: null,
    approval: null,
    resolvedApprovalIds: [],
  });
});

describe('AgentPage', () => {
  it('发送请求、展示工具审批并提交允许决定', async () => {
    mocks.listSessions.mockResolvedValue([
      {
        id: sessionId,
        title: '文件任务',
        modelId: 'qwen3.5:2b',
        datasetIds: [],
        agentType: 'agent',
        createdAt: '2026-08-28T00:00:00.000Z',
        updatedAt: '2026-08-28T00:00:00.000Z',
      },
    ]);
    mocks.listMessages.mockResolvedValue([]);
    mocks.streamAgent.mockImplementation(async (_platform, _sessionId, _request, _signal, emit) => {
      emit({ event: 'message.start', data: { messageId } });
      emit({
        event: 'tool.update',
        data: {
          messageId,
          part: {
            type: 'tool',
            id: 'call-write',
            name: 'write',
            state: 'pending',
            input: { path: 'result.md', content: '# result' },
          },
        },
      });
      emit({
        event: 'permission.asked',
        data: {
          id: approvalId,
          sessionId,
          toolCallId: 'call-write',
          tool: 'write',
          resource: 'result.md',
          diff: '+# result',
        },
      });
    });
    mocks.respondPermission.mockResolvedValue(undefined);
    renderPage();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('工作区目录'), '/workspace');
    await user.type(screen.getByLabelText('文件助手消息'), '生成文档');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(await screen.findByRole('heading', { name: '需要文件操作审批' })).toBeTruthy();
    expect(screen.getByText('+# result')).toBeTruthy();
    expect(screen.getByLabelText('文件助手消息').hasAttribute('disabled')).toBe(true);
    await user.click(screen.getByRole('button', { name: '允许一次' }));
    expect(mocks.respondPermission).toHaveBeenCalledWith(
      platform,
      sessionId,
      approvalId,
      'allow-once',
    );
  });

  it('没有会话时可以新建文件助手会话', async () => {
    mocks.listSessions.mockResolvedValue([]);
    mocks.listMessages.mockResolvedValue([]);
    mocks.createSession.mockResolvedValue({
      id: sessionId,
      title: '新文件任务',
      modelId: 'qwen3.5:2b',
      datasetIds: [],
      agentType: 'agent',
      createdAt: '2026-08-28T00:00:00.000Z',
      updatedAt: '2026-08-28T00:00:00.000Z',
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '新建' }));
    expect(mocks.createSession).toHaveBeenCalledWith(platform, {
      title: '新文件任务',
      agentType: 'agent',
    });
  });
});
