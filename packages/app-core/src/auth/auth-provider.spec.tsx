// @vitest-environment jsdom
import { ROLE_PERMISSIONS, type AuthUser } from '@ai-engine/contracts';
import {
  AUTH_TOKEN_STORAGE_KEY,
  createMemoryKeyValueStore,
  createMemorySecretStore,
  PlatformProvider,
  type Platform,
} from '@ai-engine/platform';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/http';
import { AuthProvider } from './auth-provider';
import { useAuth, useCan, type AuthContextValue } from './use-auth';

const createPlatform = (): Platform => ({
  capabilities: {
    nativeDirectoryPicker: false,
    windowControls: false,
    routerMode: 'history',
    devTools: false,
    client: 'web',
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const userFixture = (seq: number, kind: AuthUser['kind']): AuthUser => ({
  id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
  kind,
  displayName: kind === 'registered' ? 'Alice' : null,
  roles: kind === 'registered' ? ['user'] : ['guest'],
  permissions: [...(kind === 'registered' ? ROLE_PERMISSIONS.user : ROLE_PERMISSIONS.guest)],
});

const createFakeBackend = () => {
  const sessions = new Map<string, AuthUser>();
  const calls: Array<{ path: string; bearer: string | null; client: string | null }> = [];
  let seq = 0;
  const fetchMock = vi.fn(async (url: string, init: { headers?: Headers } = {}) => {
    const path = new URL(url).pathname;
    const headers = new Headers(init.headers);
    const bearer = headers.get('Authorization')?.replace(/^Bearer /, '') ?? null;
    calls.push({ path, bearer, client: headers.get('X-Client') });
    if (path === '/auth/guest') {
      seq += 1;
      const token = `guest-${seq}`;
      sessions.set(token, userFixture(seq, 'guest'));
      return json({ token, expiresAt: new Date().toISOString(), user: sessions.get(token) });
    }
    const user = bearer ? sessions.get(bearer) : undefined;
    if (!user) return json({ code: 'UNAUTHORIZED', message: 'Unauthorized' }, 401);
    if (path === '/auth/me') return json({ user, identities: [] });
    if (path === '/auth/logout') {
      sessions.delete(bearer ?? '');
      return new Response(null, { status: 204 });
    }
    return json({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    sessions,
    issueRegistered: (token: string) => {
      seq += 1;
      sessions.set(token, userFixture(seq, 'registered'));
      return { token, expiresAt: new Date().toISOString(), user: sessions.get(token)! };
    },
  };
};

const latest: { current: AuthContextValue | null } = { current: null };

const Probe = () => {
  const auth = useAuth();
  const canUseTools = useCan('chat:tools');
  useEffect(() => {
    latest.current = auth;
  }, [auth]);
  return (
    <p data-testid="probe">
      {auth.status}:{auth.user?.kind ?? 'none'}:{canUseTools ? 'tools' : 'no-tools'}
    </p>
  );
};

const renderProvider = (platform: Platform, recoveryIntervalMs?: number) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PlatformProvider value={platform}>
        <AuthProvider recoveryIntervalMs={recoveryIntervalMs}>
          <Probe />
        </AuthProvider>
      </PlatformProvider>
    </QueryClientProvider>,
  );

const probeText = () => screen.getByTestId('probe').textContent;

afterEach(() => {
  cleanup();
  latest.current = null;
  vi.unstubAllGlobals();
});

describe('AuthProvider', () => {
  it('首次启动申请访客 token 并持久化，访客没有工具权限', async () => {
    const backend = createFakeBackend();
    const platform = createPlatform();
    renderProvider(platform);

    await waitFor(() => expect(probeText()).toBe('ready:guest:no-tools'));
    await expect(platform.secrets.get(AUTH_TOKEN_STORAGE_KEY)).resolves.toBe('guest-1');
    expect(backend.calls.map((call) => call.path)).toEqual(['/auth/guest', '/auth/me']);
    expect(backend.calls[0]?.client).toBe('web');
    expect(backend.calls[1]?.bearer).toBe('guest-1');
  });

  it('本地已有 token 时直接复用，不再申请访客', async () => {
    const backend = createFakeBackend();
    const platform = createPlatform();
    const session = backend.issueRegistered('reg-1');
    await platform.secrets.set(AUTH_TOKEN_STORAGE_KEY, session.token);
    renderProvider(platform);

    await waitFor(() => expect(probeText()).toBe('ready:registered:tools'));
    expect(backend.calls.map((call) => call.path)).toEqual(['/auth/me']);
  });

  it('本地 token 已失效时清掉并重新申请访客', async () => {
    const backend = createFakeBackend();
    const platform = createPlatform();
    await platform.secrets.set(AUTH_TOKEN_STORAGE_KEY, 'revoked');
    renderProvider(platform);

    await waitFor(() => expect(probeText()).toBe('ready:guest:no-tools'));
    await expect(platform.secrets.get(AUTH_TOKEN_STORAGE_KEY)).resolves.toBe('guest-1');
    expect(backend.calls.some((call) => call.path === '/auth/guest')).toBe(true);
  });

  it('applySession 写入新 token 并刷新身份', async () => {
    const backend = createFakeBackend();
    const platform = createPlatform();
    renderProvider(platform);
    await waitFor(() => expect(probeText()).toBe('ready:guest:no-tools'));

    await act(() => latest.current!.applySession(backend.issueRegistered('reg-1')));

    await waitFor(() => expect(probeText()).toBe('ready:registered:tools'));
    await expect(platform.secrets.get(AUTH_TOKEN_STORAGE_KEY)).resolves.toBe('reg-1');
  });

  it('退出时注销服务端会话、清本地 token，并回到新的访客身份', async () => {
    const backend = createFakeBackend();
    const platform = createPlatform();
    await platform.secrets.set(AUTH_TOKEN_STORAGE_KEY, backend.issueRegistered('reg-1').token);
    renderProvider(platform);
    await waitFor(() => expect(probeText()).toBe('ready:registered:tools'));

    await act(() => latest.current!.logout());

    await waitFor(() => expect(probeText()).toBe('ready:guest:no-tools'));
    expect(backend.calls).toContainEqual(
      expect.objectContaining({ path: '/auth/logout', bearer: 'reg-1' }),
    );
    expect(backend.sessions.has('reg-1')).toBe(false);
    await expect(platform.secrets.get(AUTH_TOKEN_STORAGE_KEY)).resolves.toMatch(/^guest-/);
  });

  it('服务端会话已失效时退出，只签发一个新访客', async () => {
    const backend = createFakeBackend();
    const platform = createPlatform();
    await platform.secrets.set(AUTH_TOKEN_STORAGE_KEY, backend.issueRegistered('reg-1').token);
    renderProvider(platform);
    await waitFor(() => expect(probeText()).toBe('ready:registered:tools'));

    backend.sessions.delete('reg-1');
    await act(() => latest.current!.logout());

    await waitFor(() => expect(probeText()).toBe('ready:guest:no-tools'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(backend.calls.filter((call) => call.path === '/auth/guest')).toHaveLength(1);
    await expect(platform.secrets.get(AUTH_TOKEN_STORAGE_KEY)).resolves.toMatch(/^guest-/);
  });

  it('业务请求收到 401 时清理当前 token 并换回访客', async () => {
    const backend = createFakeBackend();
    const platform = createPlatform();
    await platform.secrets.set(AUTH_TOKEN_STORAGE_KEY, backend.issueRegistered('reg-1').token);
    renderProvider(platform);
    await waitFor(() => expect(probeText()).toBe('ready:registered:tools'));

    backend.sessions.delete('reg-1');
    await act(async () => {
      await apiFetch(platform, '/chat/sessions');
    });

    await waitFor(() => expect(probeText()).toBe('ready:guest:no-tools'));
  });

  it('迟到的 401 属于旧 token 时不清理已登录的新 token', async () => {
    const backend = createFakeBackend();
    const platform = createPlatform();
    renderProvider(platform);
    await waitFor(() => expect(probeText()).toBe('ready:guest:no-tools'));
    const stale = await platform.secrets.get(AUTH_TOKEN_STORAGE_KEY);
    backend.sessions.delete(stale ?? '');
    await act(() => latest.current!.applySession(backend.issueRegistered('reg-1')));
    await waitFor(() => expect(probeText()).toBe('ready:registered:tools'));

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ code: 'UNAUTHORIZED', message: 'x' }, 401)),
    );
    await platform.secrets.set(AUTH_TOKEN_STORAGE_KEY, stale ?? '');
    const lateRequest = apiFetch(platform, '/chat/sessions');
    await platform.secrets.set(AUTH_TOKEN_STORAGE_KEY, 'reg-1');
    await act(async () => {
      await lateRequest;
    });

    await expect(platform.secrets.get(AUTH_TOKEN_STORAGE_KEY)).resolves.toBe('reg-1');
  });

  it('后端不可达时进入 unavailable，不阻断渲染', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderProvider(createPlatform());

    await waitFor(() => expect(probeText()).toBe('unavailable:none:no-tools'));
  });

  it('后端恢复后自动重取 me，无需刷新或保存设置', async () => {
    const backend = createFakeBackend();
    const healthy = vi.mocked(fetch).getMockImplementation()!;
    let reachable = false;
    vi.mocked(fetch).mockImplementation(async (...args) => {
      if (!reachable) throw new TypeError('Failed to fetch');
      return healthy(...args);
    });
    renderProvider(createPlatform(), 20);

    await waitFor(() => expect(probeText()).toBe('unavailable:none:no-tools'));
    reachable = true;
    await waitFor(() => expect(probeText()).toBe('ready:guest:no-tools'));
    expect(backend.calls.filter((call) => call.path === '/auth/guest')).toHaveLength(1);
  });
});

describe('useCan', () => {
  it('在 AuthProvider 外恒为 false', () => {
    const Outside = () => <p data-testid="outside">{String(useCan('chat:basic'))}</p>;
    render(<Outside />);
    expect(screen.getByTestId('outside').textContent).toBe('false');
  });
});
