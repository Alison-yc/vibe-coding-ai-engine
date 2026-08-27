import { createMemoryKeyValueStore, type Platform } from '@ai-engine/platform';
import { describe, expect, it, vi } from 'vitest';
import {
  createChatSession,
  deleteChatSession,
  listChatMessages,
  listChatSessions,
  streamChat,
  updateChatSession,
} from './chat-api';
import { useChatStreamStore } from './chat-stream-store';

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
  getApiBaseUrl: () => 'http://localhost:3000/',
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

const session = {
  id: '00000000-0000-4000-8000-000000000001',
  title: '新对话',
  modelId: 'qwen3.5:2b',
  datasetIds: [],
  createdAt: '2026-08-27T00:00:00.000Z',
  updatedAt: '2026-08-27T00:00:00.000Z',
};

describe('chat-api', () => {
  it('解析会话列表与创建响应', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [session] }),
      }),
    );
    await expect(listChatSessions(stubPlatform)).resolves.toEqual([session]);
    vi.unstubAllGlobals();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => session,
      }),
    );
    await expect(createChatSession(stubPlatform, {})).resolves.toEqual(session);
    vi.unstubAllGlobals();
  });

  it('更新、删除会话并拉取消息', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...session, title: '改名' }),
      }),
    );
    await expect(updateChatSession(stubPlatform, session.id, { title: '改名' })).resolves.toEqual({
      ...session,
      title: '改名',
    });
    vi.unstubAllGlobals();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );
    await expect(deleteChatSession(stubPlatform, session.id)).resolves.toBeUndefined();
    vi.unstubAllGlobals();

    const message = {
      id: '00000000-0000-4000-8000-000000000002',
      sessionId: session.id,
      role: 'user' as const,
      parts: [{ type: 'text' as const, id: 'p1', text: 'hi' }],
      seq: 0,
      status: 'complete' as const,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [message] }),
      }),
    );
    await expect(listChatMessages(stubPlatform, session.id)).resolves.toEqual([message]);
    vi.unstubAllGlobals();
  });

  it('失败时抛出服务端 message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: '无法连接 Ollama，请确认本机模型服务已启动' }),
      }),
    );
    await expect(listChatSessions(stubPlatform)).rejects.toThrow('Ollama');
    vi.unstubAllGlobals();
  });

  it('streamChat 将 SSE 事件写入 store', async () => {
    const sse = [
      'event: message.start',
      'data: {"messageId":"00000000-0000-4000-8000-000000000002","role":"assistant"}',
      '',
      'event: done',
      'data: {"messageId":"00000000-0000-4000-8000-000000000002","status":"complete"}',
      '',
      '',
    ].join('\n');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: new Response(sse).body,
      }),
    );
    useChatStreamStore.getState().hydrate(session.id, []);
    await streamChat(stubPlatform, session.id, { content: '你好' }, new AbortController().signal);
    expect(useChatStreamStore.getState().messages[0]?.id).toBe(
      '00000000-0000-4000-8000-000000000002',
    );
    expect(useChatStreamStore.getState().streaming).toBe(false);
    vi.unstubAllGlobals();
  });
});
