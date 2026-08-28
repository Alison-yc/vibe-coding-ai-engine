// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryKeyValueStore, PlatformProvider, type Platform } from '@ai-engine/platform';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStreamStore } from '../chat/chat-stream-store';
import { ThemeProvider } from '../theme-provider';
import { ChatPage } from './chat-page';

const mocks = vi.hoisted(() => ({
  listSessions: vi.fn(),
  listMessages: vi.fn(),
  listModels: vi.fn(),
  createSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  streamChat: vi.fn(),
  respondPermission: vi.fn(),
  listDatasets: vi.fn(),
}));

vi.mock('../chat/chat-api', () => ({
  listChatSessions: mocks.listSessions,
  listChatMessages: mocks.listMessages,
  listChatModels: mocks.listModels,
  createChatSession: mocks.createSession,
  updateChatSession: mocks.updateSession,
  deleteChatSession: mocks.deleteSession,
  streamChat: mocks.streamChat,
  respondChatPermission: mocks.respondPermission,
}));

vi.mock('../knowledge/knowledge-api', () => ({ listDatasets: mocks.listDatasets }));

const session = {
  id: '00000000-0000-4000-8000-000000000001',
  title: '统一会话',
  modelId: 'qwen3.5:2b',
  datasetIds: [],
  agentType: 'chat' as const,
  createdAt: '2026-08-28T00:00:00.000Z',
  updatedAt: '2026-08-28T00:00:00.000Z',
};

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

beforeEach(() => {
  mocks.listModels.mockResolvedValue([
    {
      id: 'qwen3.5:2b',
      installed: true,
      kind: 'evaluated',
      capability: {
        id: 'qwen3.5:2b',
        supportsTools: true,
        supportsVision: false,
        supportsJsonMode: true,
        needsToolCallFallback: false,
        maxToolCount: 6,
        effectiveContextTokens: 8192,
        sourceReport: 'report.md',
      },
    },
    {
      id: 'other-chat:latest',
      installed: true,
      kind: 'untested',
      capability: {
        id: 'other-chat:latest',
        supportsTools: false,
        supportsVision: false,
        supportsJsonMode: false,
        needsToolCallFallback: false,
        maxToolCount: 0,
        effectiveContextTokens: 8192,
        sourceReport: 'untested-conservative-default',
      },
    },
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useChatStreamStore.setState({
    sessionId: null,
    messages: [],
    streaming: false,
    error: null,
    warning: null,
    approval: null,
    activeRequestId: null,
    resolvedApprovalIds: [],
  });
});

describe('统一对话文件能力', () => {
  it('切换未知模型后关闭并禁用文件访问', async () => {
    const unknownSession = { ...session, modelId: 'other-chat:latest' };
    mocks.listSessions.mockResolvedValueOnce([session]).mockResolvedValue([unknownSession]);
    mocks.listMessages.mockResolvedValue([]);
    mocks.listDatasets.mockResolvedValue([]);
    mocks.updateSession.mockResolvedValue(unknownSession);
    const user = userEvent.setup();
    render(
      <PlatformProvider value={platform}>
        <ThemeProvider>
          <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
          >
            <MemoryRouter initialEntries={[`/chat/${session.id}`]}>
              <Routes>
                <Route path="/chat/:sessionId" element={<ChatPage />} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        </ThemeProvider>
      </PlatformProvider>,
    );

    const modelSelect = await screen.findByLabelText('对话模型');
    await waitFor(() => expect((modelSelect as HTMLSelectElement).disabled).toBe(false));
    await user.selectOptions(modelSelect, 'other-chat:latest');
    await waitFor(() =>
      expect(mocks.updateSession).toHaveBeenCalledWith(platform, session.id, {
        modelId: 'other-chat:latest',
      }),
    );
    expect(await screen.findByText(/仅支持普通对话与知识库问答/)).toBeDefined();
    expect((screen.getByRole('checkbox', { name: '文件访问' }) as HTMLInputElement).disabled).toBe(
      true,
    );
  });

  it('按轮次开启文件访问并通过 chat stream 发送', async () => {
    mocks.listSessions.mockResolvedValue([session]);
    mocks.listMessages.mockResolvedValue([]);
    mocks.listDatasets.mockResolvedValue([]);
    mocks.streamChat.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <PlatformProvider value={platform}>
        <ThemeProvider>
          <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
          >
            <MemoryRouter initialEntries={[`/chat/${session.id}`]}>
              <Routes>
                <Route path="/chat/:sessionId" element={<ChatPage />} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        </ThemeProvider>
      </PlatformProvider>,
    );

    const toggle = await screen.findByRole('checkbox', { name: '文件访问' });
    await user.click(toggle);
    await user.type(screen.getByLabelText('工作区目录'), '/workspace');
    await user.type(screen.getByPlaceholderText(/输入消息/), '读取 README.md');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() =>
      expect(mocks.streamChat).toHaveBeenCalledWith(
        platform,
        session.id,
        expect.objectContaining({
          content: '读取 README.md',
          fileAccess: true,
          workspaceRoot: '/workspace',
          mode: 'edit',
        }),
        expect.any(AbortSignal),
        expect.any(String),
      ),
    );
    await user.click(toggle);
    expect(screen.queryByLabelText('工作区目录')).toBeNull();
  });

  it('在统一页面响应工具审批', async () => {
    mocks.listSessions.mockResolvedValue([session]);
    mocks.listMessages.mockResolvedValue([]);
    mocks.listDatasets.mockResolvedValue([]);
    mocks.respondPermission.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <PlatformProvider value={platform}>
        <ThemeProvider>
          <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
          >
            <MemoryRouter initialEntries={[`/chat/${session.id}`]}>
              <Routes>
                <Route path="/chat/:sessionId" element={<ChatPage />} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        </ThemeProvider>
      </PlatformProvider>,
    );

    await screen.findAllByText('统一会话');
    useChatStreamStore.setState({
      approval: {
        id: '00000000-0000-4000-8000-000000000002',
        sessionId: session.id,
        toolCallId: 'call-write',
        tool: 'write',
        resource: 'README.md',
        diff: '+内容',
      },
    });
    await user.click(await screen.findByRole('button', { name: '允许一次' }));
    await waitFor(() =>
      expect(mocks.respondPermission).toHaveBeenCalledWith(
        platform,
        session.id,
        '00000000-0000-4000-8000-000000000002',
        'allow-once',
      ),
    );
  });

  it('恢复到活动工具时禁止重复发送', async () => {
    mocks.listSessions.mockResolvedValue([session]);
    mocks.listMessages.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000003',
        sessionId: session.id,
        role: 'assistant',
        parts: [{ type: 'tool', id: 'call-read', name: 'read_file', state: 'running' }],
        seq: 1,
        status: 'complete',
      },
    ]);
    mocks.listDatasets.mockResolvedValue([]);

    render(
      <PlatformProvider value={platform}>
        <ThemeProvider>
          <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
          >
            <MemoryRouter initialEntries={[`/chat/${session.id}`]}>
              <Routes>
                <Route path="/chat/:sessionId" element={<ChatPage />} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        </ThemeProvider>
      </PlatformProvider>,
    );

    const input = await screen.findByPlaceholderText(/输入消息/);
    await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(true));
    expect((screen.getByRole('checkbox', { name: '文件访问' }) as HTMLInputElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: '发送' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
