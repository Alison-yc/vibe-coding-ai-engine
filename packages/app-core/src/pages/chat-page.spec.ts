import { createMemoryKeyValueStore, PlatformProvider, type Platform } from '@ai-engine/platform';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../theme-provider';
import { useChatStreamStore } from '../chat/chat-stream-store';
import { ChatBubble, ChatPage, SessionList } from './chat-page';

const stubPlatform: Platform = {
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
  getAppInfo: async () => ({ name: 'test', version: '0.0.0' }),
  getSystemTheme: () => 'light',
  subscribeSystemTheme: () => () => undefined,
  window: {
    minimize: async () => undefined,
    maximize: async () => undefined,
    close: async () => undefined,
    reload: async () => undefined,
  },
};

describe('ChatPage', () => {
  it('渲染侧边栏、空态与输入区', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => (String(url).includes('/knowledge/datasets') ? [] : { sessions: [] }),
      })),
    );
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        createElement(
          PlatformProvider,
          { value: stubPlatform },
          createElement(
            MemoryRouter,
            { initialEntries: ['/chat'] },
            createElement(ThemeProvider, null, createElement(ChatPage)),
          ),
        ),
      ),
    );
    expect(html).toContain('对话');
    expect(html).toContain('新建会话');
    expect(html).toContain('还没有会话');
    expect(html).toContain('从左侧新建或选择一个会话');
    expect(html).toContain('知识库挂载');
    vi.unstubAllGlobals();
  });

  it('SessionList 覆盖重命名与删除确认', () => {
    const session = {
      id: '00000000-0000-4000-8000-000000000001',
      title: '问候',
      modelId: 'qwen3.5:2b',
      datasetIds: [],
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
    };
    const listed = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(SessionList, {
          sessions: [session],
          currentId: session.id,
          renameId: null,
          renameValue: '',
          pendingDeleteId: null,
          onRenameValue: () => undefined,
          onStartRename: () => undefined,
          onConfirmRename: () => undefined,
          onCancelRename: () => undefined,
          onAskDelete: () => undefined,
          onConfirmDelete: () => undefined,
          onCancelDelete: () => undefined,
        }),
      ),
    );
    expect(listed).toContain('问候');
    expect(listed).toContain('重命名');
    const renaming = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(SessionList, {
          sessions: [session],
          currentId: session.id,
          renameId: session.id,
          renameValue: '新标题',
          pendingDeleteId: null,
          onRenameValue: () => undefined,
          onStartRename: () => undefined,
          onConfirmRename: () => undefined,
          onCancelRename: () => undefined,
          onAskDelete: () => undefined,
          onConfirmDelete: () => undefined,
          onCancelDelete: () => undefined,
        }),
      ),
    );
    expect(renaming).toContain('保存');
    const deleting = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(SessionList, {
          sessions: [session],
          currentId: session.id,
          renameId: null,
          renameValue: '',
          pendingDeleteId: session.id,
          onRenameValue: () => undefined,
          onStartRename: () => undefined,
          onConfirmRename: () => undefined,
          onCancelRename: () => undefined,
          onAskDelete: () => undefined,
          onConfirmDelete: () => undefined,
          onCancelDelete: () => undefined,
        }),
      ),
    );
    expect(deleting).toContain('确认删除');
  });

  it('ChatBubble 渲染用户、助手与中断标记', () => {
    const sessionId = '00000000-0000-4000-8000-000000000001';
    const user = {
      id: '00000000-0000-4000-8000-000000000002',
      sessionId,
      role: 'user' as const,
      parts: [{ type: 'text' as const, id: 'u', text: '问题' }],
      seq: 0,
      status: 'complete' as const,
    };
    const assistant = {
      id: '00000000-0000-4000-8000-000000000003',
      sessionId,
      role: 'assistant' as const,
      parts: [{ type: 'text' as const, id: 'a', text: '回答' }],
      seq: 1,
      status: 'interrupted' as const,
    };
    useChatStreamStore.getState().hydrate(sessionId, [user, assistant]);
    const html = renderToStaticMarkup(
      createElement(
        'ol',
        null,
        createElement(ChatBubble, { message: user }),
        createElement(ChatBubble, { message: assistant }),
      ),
    );
    expect(html).toContain('问题');
    expect(html).toContain('回答');
    expect(html).toContain('已停止');
  });
});
