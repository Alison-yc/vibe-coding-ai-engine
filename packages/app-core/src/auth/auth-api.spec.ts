import {
  AUTH_TOKEN_STORAGE_KEY,
  createMemoryKeyValueStore,
  createMemorySecretStore,
  type Platform,
} from '@ai-engine/platform';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMe, loginWithCode, loginWithPassword, registerAccount } from './auth-api';

const createPlatform = (client?: 'web' | 'desktop'): Platform => ({
  capabilities: {
    nativeDirectoryPicker: false,
    windowControls: false,
    routerMode: 'history',
    devTools: false,
    client,
  },
  pickDirectory: async () => null,
  pickFiles: async () => [],
  kv: createMemoryKeyValueStore(),
  secrets: createMemorySecretStore(),
  getApiBaseUrl: () => 'http://localhost:3000',
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

const session = {
  token: 'tok-new',
  expiresAt: '2026-10-09T00:00:00.000Z',
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    kind: 'registered',
    displayName: null,
    roles: ['user'],
    permissions: ['chat:basic'],
  },
};

const stubFetch = (body: unknown, status = 200) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const sentHeaders = (fetchMock: ReturnType<typeof vi.fn>) =>
  (fetchMock.mock.calls[0]?.[1] as { headers: Headers }).headers;

const platformWithToken = async (client?: 'web' | 'desktop') => {
  const platform = createPlatform(client);
  await platform.secrets.set(AUTH_TOKEN_STORAGE_KEY, 'tok-guest');
  return platform;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('auth-api', () => {
  it('密码登录与验证码登录不携带本地 token，并声明客户端类型', async () => {
    const platform = await platformWithToken('desktop');
    const fetchMock = stubFetch(session);
    await loginWithPassword(platform, {
      type: 'email',
      identifier: 'a@example.com',
      password: 'correct-horse',
    });
    expect(sentHeaders(fetchMock).has('Authorization')).toBe(false);
    expect(sentHeaders(fetchMock).get('X-Client')).toBe('desktop');

    const codeFetch = stubFetch(session);
    await loginWithCode(platform, { type: 'email', identifier: 'a@example.com', code: '246810' });
    expect(sentHeaders(codeFetch).has('Authorization')).toBe(false);
  });

  it('注册携带访客 token，便于服务端原地升级同一用户', async () => {
    const platform = await platformWithToken();
    const fetchMock = stubFetch(session);

    await registerAccount(platform, {
      type: 'email',
      identifier: 'a@example.com',
      password: 'correct-horse',
      code: '246810',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3000/auth/register');
    expect(sentHeaders(fetchMock).get('Authorization')).toBe('Bearer tok-guest');
    expect(sentHeaders(fetchMock).has('X-Client')).toBe(false);
  });

  it('响应不符合契约时拒绝，而不是把残缺数据交给界面', async () => {
    const platform = await platformWithToken();
    stubFetch({ token: 'x', user: { id: 'not-a-uuid' } });
    await expect(
      loginWithPassword(platform, {
        type: 'email',
        identifier: 'a@example.com',
        password: 'correct-horse',
      }),
    ).rejects.toThrow();

    stubFetch({ user: session.user });
    await expect(fetchMe(platform)).rejects.toThrow();
  });

  it('登录失败时抛出带错误码的错误', async () => {
    const platform = await platformWithToken();
    stubFetch({ code: 'INVALID_CREDENTIALS', message: '账号或密码错误' }, 401);
    await expect(
      loginWithPassword(platform, {
        type: 'email',
        identifier: 'a@example.com',
        password: 'correct-horse',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
});
