import { createMemoryKeyValueStore, PlatformProvider, type Platform } from '@ai-engine/platform';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { AppRoutes } from './app-routes';
import { createApiClient, createExampleChatRequest } from './api/client';

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    BrowserRouter: actual.MemoryRouter,
    HashRouter: actual.MemoryRouter,
  };
});

const stubPlatform = {
  capabilities: {
    nativeDirectoryPicker: false,
    windowControls: false,
    routerMode: 'history' as const,
  },
  pickDirectory: async () => null,
  pickFiles: async () => [],
  kv: createMemoryKeyValueStore(),
  getApiBaseUrl: () => 'http://localhost:3000',
  openExternal: async () => undefined,
  getAppInfo: async () => ({ name: 'test', version: '0.0.0' }),
  getSystemTheme: () => 'light' as const,
  subscribeSystemTheme: () => () => undefined,
  window: {
    minimize: async () => undefined,
    maximize: async () => undefined,
    close: async () => undefined,
  },
} satisfies Platform;

describe('createExampleChatRequest', () => {
  it('产出符合 ChatRequest 契约的对象', () => {
    expect(createExampleChatRequest()).toEqual({
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      content: 'ping',
    });
  });
});

describe('createApiClient', () => {
  it('发送翻译请求并用契约解析响应', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'Hello' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient(stubPlatform);
    await expect(client.translate({ text: '你好' })).resolves.toEqual({ text: 'Hello' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/llm/translate',
      expect.objectContaining({ method: 'POST' }),
    );

    vi.unstubAllGlobals();
  });

  it('翻译接口失败时抛出包含状态码的错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ code: 'SERVICE_UNAVAILABLE', message: 'busy' }),
      }),
    );

    const client = createApiClient({
      ...stubPlatform,
      getApiBaseUrl: () => 'http://localhost:3000/',
    });
    await expect(client.translate({ text: '你好' })).rejects.toThrow('busy');

    vi.unstubAllGlobals();
  });

  it('错误体不符合契约时回退到状态码', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ oops: true }),
      }),
    );

    const client = createApiClient(stubPlatform);
    await expect(client.translate({ text: '你好' })).rejects.toThrow('翻译请求失败: 500');

    vi.unstubAllGlobals();
  });

  it('chat 方法用 ChatRequestSchema 校验入参', async () => {
    const client = createApiClient(stubPlatform);
    await expect(client.chat(createExampleChatRequest())).resolves.toEqual(
      createExampleChatRequest(),
    );
  });
});

describe('App', () => {
  it('在 history 模式下渲染占位路由', () => {
    const html = renderToStaticMarkup(
      createElement(PlatformProvider, { value: stubPlatform }, createElement(App)),
    );
    // MemoryRouter 默认落在 `/`，SSR 不会跟随 Navigate，因此 markup 为空。
    expect(html).toBe('');
  });

  it('在 hash 模式下也能渲染占位路由', () => {
    const html = renderToStaticMarkup(
      createElement(
        PlatformProvider,
        {
          value: {
            ...stubPlatform,
            capabilities: { ...stubPlatform.capabilities, routerMode: 'hash' },
          },
        },
        createElement(App),
      ),
    );
    expect(html).toBe('');
  });
});

describe('AppRoutes', () => {
  it('在 /chat 渲染对话占位', () => {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ['/chat'] }, createElement(AppRoutes)),
    );
    expect(html).toContain('对话');
  });
});
