import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryKeyValueStore, type Platform } from '@ai-engine/platform';
import { isAbortError, publicChatError, runChatStream } from './use-chat-stream';
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

describe('runChatStream', () => {
  it('识别中断与公共错误文案', () => {
    const aborted = new Error('Aborted');
    aborted.name = 'AbortError';
    expect(isAbortError(aborted, false)).toBe(true);
    expect(isAbortError(new Error('x'), true)).toBe(true);
    expect(isAbortError(new Error('x'), false)).toBe(false);
    expect(publicChatError('x')).toBe('生成失败');
  });

  it('空内容直接返回', async () => {
    useChatStreamStore.getState().hydrate('00000000-0000-4000-8000-000000000001', []);
    await runChatStream({
      platform: stubPlatform,
      sessionId: '00000000-0000-4000-8000-000000000001',
      request: { content: '   ', fileAccess: false, mode: 'edit' },
      signal: new AbortController().signal,
      queryClient: new QueryClient(),
    });
    expect(useChatStreamStore.getState().messages).toHaveLength(0);
  });

  it('请求失败时写入 error 并结束 streaming', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      }),
    );
    useChatStreamStore.getState().hydrate('00000000-0000-4000-8000-000000000001', []);
    await runChatStream({
      platform: stubPlatform,
      sessionId: '00000000-0000-4000-8000-000000000001',
      request: { content: '你好', fileAccess: false, mode: 'edit' },
      signal: new AbortController().signal,
      queryClient: new QueryClient(),
    });
    expect(useChatStreamStore.getState().error).toContain('无法开始生成');
    expect(useChatStreamStore.getState().streaming).toBe(false);
    vi.unstubAllGlobals();
  });
});
