import {
  AUTH_TOKEN_STORAGE_KEY,
  createMemoryKeyValueStore,
  createMemorySecretStore,
  type Platform,
} from '@ai-engine/platform';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from './api-error';
import { apiFetch, apiJson, subscribeUnauthorized } from './http';

const createPlatform = (): Platform => ({
  capabilities: {
    nativeDirectoryPicker: false,
    windowControls: false,
    routerMode: 'history',
    devTools: false,
  },
  pickDirectory: async () => null,
  pickFiles: async () => [],
  kv: createMemoryKeyValueStore(),
  secrets: createMemorySecretStore(),
  getApiBaseUrl: () => 'http://localhost:3000/',
  getUiLocale: async () => 'zh-CN',
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
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const stubFetch = (response: Response) => {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const sentHeaders = (fetchMock: ReturnType<typeof vi.fn>) =>
  (fetchMock.mock.calls[0]?.[1] as { headers: Headers }).headers;

const unauthorized = { code: 'UNAUTHORIZED', message: 'Unauthorized' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('拼接去尾斜杠的 baseUrl，并在有 token 时注入 Bearer', async () => {
    const platform = createPlatform();
    await platform.secrets.set(AUTH_TOKEN_STORAGE_KEY, 'tok-1');
    const fetchMock = stubFetch(jsonResponse({}));

    await apiFetch(platform, '/chat/sessions', { method: 'POST', body: '{}' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3000/chat/sessions');
    expect(sentHeaders(fetchMock).get('Authorization')).toBe('Bearer tok-1');
    expect(sentHeaders(fetchMock).get('Content-Type')).toBe('application/json');
  });

  it('没有 token 时不发送 Authorization；无 body 时不强加 Content-Type', async () => {
    const fetchMock = stubFetch(jsonResponse({}));

    await apiFetch(createPlatform(), '/health');

    expect(sentHeaders(fetchMock).has('Authorization')).toBe(false);
    expect(sentHeaders(fetchMock).has('Content-Type')).toBe(false);
  });

  it('FormData 交给浏览器生成 multipart 边界，不设置 Content-Type', async () => {
    const fetchMock = stubFetch(jsonResponse({}));

    await apiFetch(createPlatform(), '/upload', { method: 'POST', body: new FormData() });

    expect(sentHeaders(fetchMock).has('Content-Type')).toBe(false);
  });

  it('anonymous 请求即使本地有 token 也不携带', async () => {
    const platform = createPlatform();
    await platform.secrets.set(AUTH_TOKEN_STORAGE_KEY, 'tok-1');
    const fetchMock = stubFetch(jsonResponse({}));

    await apiFetch(platform, '/auth/login/password', {}, { anonymous: true });

    expect(sentHeaders(fetchMock).has('Authorization')).toBe(false);
  });

  it('携带 token 的请求收到 401 时通知订阅者被拒的 token', async () => {
    const platform = createPlatform();
    await platform.secrets.set(AUTH_TOKEN_STORAGE_KEY, 'tok-1');
    const listener = vi.fn();
    subscribeUnauthorized(platform, listener);
    stubFetch(jsonResponse(unauthorized, 401));

    await apiFetch(platform, '/auth/me');

    expect(listener).toHaveBeenCalledWith('tok-1');
  });

  it('未携带 token 的 401（如登录密码错误）不触发失效处理', async () => {
    const platform = createPlatform();
    await platform.secrets.set(AUTH_TOKEN_STORAGE_KEY, 'tok-1');
    const listener = vi.fn();
    subscribeUnauthorized(platform, listener);
    stubFetch(jsonResponse({ code: 'INVALID_CREDENTIALS', message: 'x' }, 401));

    await apiFetch(platform, '/auth/login/password', {}, { anonymous: true });

    expect(listener).not.toHaveBeenCalled();
  });

  it('取消订阅后不再通知，且不同 platform 实例互不影响', async () => {
    const platform = createPlatform();
    const other = createPlatform();
    await platform.secrets.set(AUTH_TOKEN_STORAGE_KEY, 'tok-1');
    const listener = vi.fn();
    const otherListener = vi.fn();
    const unsubscribe = subscribeUnauthorized(platform, listener);
    subscribeUnauthorized(other, otherListener);
    unsubscribe();
    stubFetch(jsonResponse(unauthorized, 401));

    await apiFetch(platform, '/auth/me');

    expect(listener).not.toHaveBeenCalled();
    expect(otherListener).not.toHaveBeenCalled();
  });
});

describe('apiJson', () => {
  it('成功时返回解析后的 JSON', async () => {
    stubFetch(jsonResponse({ ok: 1 }));
    await expect(apiJson(createPlatform(), '/x')).resolves.toEqual({ ok: 1 });
  });

  it('失败时抛出带错误码的 ApiRequestError', async () => {
    stubFetch(jsonResponse({ code: 'RATE_LIMITED', message: 'slow down' }, 429));

    const error: unknown = await apiJson(createPlatform(), '/x').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).code).toBe('RATE_LIMITED');
  });

  it('响应体不是 JSON 时按 HTTP 状态报错', async () => {
    stubFetch(new Response('oops', { status: 502 }));
    await expect(apiJson(createPlatform(), '/x')).rejects.toThrow('HTTP 502');
  });
});
