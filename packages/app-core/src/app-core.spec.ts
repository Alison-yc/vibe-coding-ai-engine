import { createMemoryKeyValueStore, PlatformProvider, type Platform } from '@ai-engine/platform';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createInstance } from 'i18next';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { AppRoutes } from './app-routes';
import { createApiClient, createExampleChatRequest } from './api/client';
import { ThemeProvider, useTheme } from './theme-provider';
import { applyThemeToDocument, bindThemeRuntime, persistThemePreference } from './theme-sync';
import { createI18nOptions } from './i18n/resources';

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
    devTools: true,
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
    reload: async () => undefined,
  },
} satisfies Platform;

const i18n = createInstance();
beforeAll(async () => {
  await i18n.init(createI18nOptions('zh-CN'));
});
const renderLocalized = (element: ReactElement) =>
  renderToStaticMarkup(createElement(I18nextProvider, { i18n }, element));

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
    await expect(client.translate({ text: '你好' })).rejects.toThrow('HTTP 500');

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
    const html = renderLocalized(
      createElement(PlatformProvider, { value: stubPlatform }, createElement(App)),
    );
    // MemoryRouter 默认落在 `/`，SSR 不会跟随 Navigate，因此 markup 为空。
    expect(html).toBe('');
  });

  it('在 hash 模式下也能渲染占位路由', () => {
    const html = renderLocalized(
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
  it('在 /chat 渲染对话页', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => (String(url).includes('/knowledge/datasets') ? [] : { sessions: [] }),
      })),
    );
    const html = renderLocalized(
      createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        createElement(
          PlatformProvider,
          { value: stubPlatform },
          createElement(
            MemoryRouter,
            { initialEntries: ['/chat'] },
            createElement(ThemeProvider, null, createElement(AppRoutes)),
          ),
        ),
      ),
    );
    expect(html).toContain('对话');
    expect(html).toContain('新建会话');
    vi.unstubAllGlobals();
  });

  it('在 /dev/tokens 渲染令牌页', () => {
    const html = renderLocalized(
      createElement(
        PlatformProvider,
        { value: stubPlatform },
        createElement(
          MemoryRouter,
          { initialEntries: ['/dev/tokens'] },
          createElement(ThemeProvider, null, createElement(AppRoutes)),
        ),
      ),
    );
    expect(html).toContain('设计令牌');
    expect(html).toContain('bg-node-running');
  });

  it('在 /dev/observability 渲染可观测性页', () => {
    const html = renderLocalized(
      createElement(
        PlatformProvider,
        { value: stubPlatform },
        createElement(
          MemoryRouter,
          { initialEntries: ['/dev/observability'] },
          createElement(ThemeProvider, null, createElement(AppRoutes)),
        ),
      ),
    );
    expect(html).toContain('可观测性');
    expect(html).toContain('加载指标');
  });

  it('在 /knowledge 渲染知识库列表', () => {
    const html = renderLocalized(
      createElement(
        PlatformProvider,
        { value: stubPlatform },
        createElement(
          QueryClientProvider,
          { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
          createElement(MemoryRouter, { initialEntries: ['/knowledge'] }, createElement(AppRoutes)),
        ),
      ),
    );
    expect(html).toContain('知识库');
    expect(html).toContain('正在加载知识库');
  });
});

describe('useTheme', () => {
  it('在 Provider 外使用时抛错', () => {
    const Probe = () => {
      useTheme();
      return null;
    };
    expect(() => renderToStaticMarkup(createElement(Probe))).toThrow('ThemeProvider');
  });
});

describe('theme-sync', () => {
  it('document 不存在时 apply 直接返回', () => {
    applyThemeToDocument({ palette: 'blue', mode: 'dark' }, 'light');
  });

  it('把偏好写入 kv', async () => {
    await persistThemePreference(stubPlatform.kv, { palette: 'purple', mode: 'light' });
    await expect(stubPlatform.kv.get('theme-preference')).resolves.toBe(
      '{"palette":"purple","mode":"light"}',
    );
  });

  it('从 kv 恢复偏好并订阅系统主题', async () => {
    const onPreference = vi.fn();
    const onSystem = vi.fn();
    await stubPlatform.kv.set('theme-preference', '{"palette":"green","mode":"dark"}');
    const unsubscribe = bindThemeRuntime(stubPlatform, onPreference, onSystem);
    await Promise.resolve();
    await Promise.resolve();
    expect(onPreference).toHaveBeenCalledWith({ palette: 'green', mode: 'dark' });
    unsubscribe();
  });

  it('卸载后不再把延迟的 kv 结果写回', async () => {
    const deferred = Promise.withResolvers<string | null>();
    const platform: Platform = {
      ...stubPlatform,
      kv: {
        ...stubPlatform.kv,
        get: () => deferred.promise,
      },
    };
    const onPreference = vi.fn();
    const unsubscribe = bindThemeRuntime(platform, onPreference, vi.fn());
    unsubscribe();
    deferred.resolve('{"palette":"blue","mode":"dark"}');
    await Promise.resolve();
    await Promise.resolve();
    expect(onPreference).not.toHaveBeenCalled();
  });

  it('存在 document 时写入 data-theme', () => {
    const setAttribute = vi.fn();
    const toggle = vi.fn();
    vi.stubGlobal('document', {
      documentElement: {
        setAttribute,
        removeAttribute: vi.fn(),
        classList: { toggle },
      },
    });
    applyThemeToDocument({ palette: 'blue', mode: 'dark' }, 'light');
    expect(setAttribute).toHaveBeenCalledWith('data-theme', 'blue');
    expect(toggle).toHaveBeenCalledWith('dark', true);
    vi.unstubAllGlobals();
  });
});
