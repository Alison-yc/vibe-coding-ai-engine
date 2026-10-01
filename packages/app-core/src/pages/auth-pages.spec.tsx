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
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/auth-provider';
import { PageShell } from '../components/page-shell';
import { createI18nOptions } from '../i18n/resources';
import { LoginPage } from './login-page';
import { RegisterPage } from './register-page';
import { ResetPasswordPage } from './reset-password-page';

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

const STATIC_CODE = '246810';
const ACCOUNT = { identifier: 'alice@example.com', password: 'correct-horse' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Call = { path: string; bearer: string | null; body: Record<string, unknown> | null };

const createFakeBackend = () => {
  const sessions = new Map<string, AuthUser>();
  const calls: Call[] = [];
  let seq = 0;
  const user = (kind: AuthUser['kind']): AuthUser => {
    seq += 1;
    return {
      id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
      kind,
      displayName: kind === 'registered' ? 'Alice' : null,
      roles: kind === 'registered' ? ['user'] : ['guest'],
      permissions: [...ROLE_PERMISSIONS[kind === 'registered' ? 'user' : 'guest']],
    };
  };
  const session = (kind: AuthUser['kind']) => {
    const next = user(kind);
    const token = `${kind}-${seq}`;
    sessions.set(token, next);
    return json({ token, expiresAt: new Date().toISOString(), user: next });
  };
  const invalid = (code: string, status: number) => json({ code, message: code }, status);

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { headers?: Headers; body?: unknown } = {}) => {
      const path = new URL(url).pathname;
      const bearer =
        new Headers(init.headers).get('Authorization')?.replace(/^Bearer /, '') ?? null;
      const body =
        typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      calls.push({ path, bearer, body });
      switch (path) {
        case '/auth/guest':
          return session('guest');
        case '/auth/verification-codes':
          return json({ expiresInSec: 300, resendAfterSec: 60 });
        case '/auth/login/password':
          return body?.identifier === ACCOUNT.identifier && body.password === ACCOUNT.password
            ? session('registered')
            : invalid('INVALID_CREDENTIALS', 401);
        case '/auth/login/code':
          return body?.code === STATIC_CODE
            ? session('registered')
            : invalid('VERIFICATION_CODE_INVALID', 400);
        case '/auth/register':
          return body?.code === STATIC_CODE
            ? session('registered')
            : invalid('VERIFICATION_CODE_INVALID', 400);
        case '/auth/password-resets':
          return new Response(null, { status: 204 });
        default:
          break;
      }
      const current = bearer ? sessions.get(bearer) : undefined;
      if (!current) return invalid('UNAUTHORIZED', 401);
      if (path === '/auth/me') return json({ user: current, identities: [] });
      if (path === '/auth/logout') {
        sessions.delete(bearer ?? '');
        return new Response(null, { status: 204 });
      }
      return json({});
    }),
  );

  return { calls, callsTo: (target: string) => calls.filter((call) => call.path === target) };
};

const i18n = createInstance();
beforeAll(async () => {
  await i18n.init(createI18nOptions('zh-CN'));
});

const renderAt = (entry: string, platform = createPlatform()) => {
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <PlatformProvider value={platform}>
          <MemoryRouter initialEntries={[entry]}>
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/chat" element={<p>chat-target</p>} />
                <Route path="/knowledge" element={<p>knowledge-target</p>} />
                <Route
                  path="/somewhere"
                  element={
                    <PageShell title="somewhere">
                      <p>content</p>
                    </PageShell>
                  }
                />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </PlatformProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return platform;
};

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const submit = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

const waitForGuest = async (platform: Platform) =>
  waitFor(async () =>
    expect(await platform.secrets.get(AUTH_TOKEN_STORAGE_KEY)).toMatch(/^guest-/),
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('登录页', () => {
  it('密码登录成功后写入新 token，并跳回 redirect 指定的站内页面', async () => {
    const backend = createFakeBackend();
    const platform = renderAt('/login?redirect=%2Fknowledge');
    await waitForGuest(platform);

    type('邮箱或手机号', ' Alice@Example.com ');
    type('密码', ACCOUNT.password);
    submit('登录');

    expect(await screen.findByText('knowledge-target')).toBeTruthy();
    await expect(platform.secrets.get(AUTH_TOKEN_STORAGE_KEY)).resolves.toMatch(/^registered-/);
    const [login] = backend.callsTo('/auth/login/password');
    expect(login?.body).toMatchObject({ type: 'email', identifier: ACCOUNT.identifier });
    expect(login?.bearer).toBeNull();
  });

  it('密码错误时提示统一文案，且不清掉当前访客 token', async () => {
    createFakeBackend();
    const platform = renderAt('/login');
    await waitForGuest(platform);
    const guestToken = await platform.secrets.get(AUTH_TOKEN_STORAGE_KEY);

    type('邮箱或手机号', ACCOUNT.identifier);
    type('密码', 'wrong-password');
    submit('登录');

    expect((await screen.findByRole('alert')).textContent).toBe('账号或密码错误。');
    await expect(platform.secrets.get(AUTH_TOKEN_STORAGE_KEY)).resolves.toBe(guestToken);
  });

  it('账号格式不合法时只做本地提示，不发请求', async () => {
    const backend = createFakeBackend();
    const platform = renderAt('/login');
    await waitForGuest(platform);

    type('邮箱或手机号', '12345');
    type('密码', ACCOUNT.password);
    submit('登录');

    expect((await screen.findByRole('alert')).textContent).toBe(
      '请输入有效的邮箱或大陆 11 位手机号。',
    );
    expect(backend.callsTo('/auth/login/password')).toHaveLength(0);
  });

  it('redirect 指向站外时登录后落到默认页', async () => {
    createFakeBackend();
    const platform = renderAt('/login?redirect=%2F%2Fevil.example');
    await waitForGuest(platform);

    type('邮箱或手机号', ACCOUNT.identifier);
    type('密码', ACCOUNT.password);
    submit('登录');

    expect(await screen.findByText('chat-target')).toBeTruthy();
  });

  it('验证码登录：发码后按钮进入 60 秒倒计时并提示静态码来源', async () => {
    const backend = createFakeBackend();
    const platform = renderAt('/login');
    await waitForGuest(platform);

    fireEvent.click(screen.getByRole('tab', { name: '验证码登录' }));
    type('邮箱或手机号', ACCOUNT.identifier);
    submit('获取验证码');

    const countdown = await screen.findByRole('button', { name: '60 秒后重发' });
    expect((countdown as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('AUTH_STATIC_VERIFICATION_CODE');
    expect(backend.callsTo('/auth/verification-codes')[0]?.body).toMatchObject({
      purpose: 'login',
      identifier: ACCOUNT.identifier,
    });

    type('验证码', STATIC_CODE);
    submit('登录');
    expect(await screen.findByText('chat-target')).toBeTruthy();
  });
});

describe('注册页', () => {
  it('两次密码不一致时本地拦截', async () => {
    const backend = createFakeBackend();
    const platform = renderAt('/register');
    await waitForGuest(platform);

    type('邮箱', ACCOUNT.identifier);
    type('验证码', STATIC_CODE);
    type('密码', ACCOUNT.password);
    type('确认密码', 'another-password');
    submit('注册');

    expect((await screen.findByRole('alert')).textContent).toBe('两次输入的密码不一致。');
    expect(backend.callsTo('/auth/register')).toHaveLength(0);
  });

  it('手机号注册携带访客 token 并归一化号码，成功后导航栏切换为已登录', async () => {
    const backend = createFakeBackend();
    const platform = renderAt('/register?redirect=%2Fsomewhere');
    await waitForGuest(platform);
    const guestToken = await platform.secrets.get(AUTH_TOKEN_STORAGE_KEY);

    fireEvent.click(screen.getByRole('radio', { name: '手机号' }));
    type('手机号', '138 0000 0000');
    type('验证码', STATIC_CODE);
    type('密码', ACCOUNT.password);
    type('确认密码', ACCOUNT.password);
    submit('注册');

    expect(await screen.findByRole('button', { name: '退出登录' })).toBeTruthy();
    const [register] = backend.callsTo('/auth/register');
    expect(register?.bearer).toBe(guestToken);
    expect(register?.body).toMatchObject({ type: 'phone', identifier: '+8613800000000' });
  });
});

describe('重置密码页', () => {
  it('提交成功后展示结果并提供返回登录入口', async () => {
    const backend = createFakeBackend();
    const platform = renderAt('/reset-password');
    await waitForGuest(platform);

    type('邮箱或手机号', ACCOUNT.identifier);
    type('验证码', STATIC_CODE);
    type('新密码', 'brand-new-pass');
    type('确认密码', 'brand-new-pass');
    submit('重置密码');

    expect((await screen.findByRole('status')).textContent).toBe('密码已重置，请使用新密码登录。');
    expect(screen.getByRole('link', { name: '返回登录' })).toBeTruthy();
    expect(backend.callsTo('/auth/password-resets')[0]?.bearer).toBeNull();
  });
});

describe('导航账号入口', () => {
  it('访客显示登录入口并带上当前路径；登录后可退出回到访客', async () => {
    const backend = createFakeBackend();
    const platform = renderAt('/somewhere');
    await waitForGuest(platform);

    const loginLink = await screen.findByRole('link', { name: '登录' });
    expect(loginLink.getAttribute('href')).toBe('/login?redirect=%2Fsomewhere');

    fireEvent.click(loginLink);
    type('邮箱或手机号', ACCOUNT.identifier);
    type('密码', ACCOUNT.password);
    submit('登录');
    fireEvent.click(await screen.findByRole('button', { name: '退出登录' }));

    expect(await screen.findByRole('link', { name: '登录' })).toBeTruthy();
    expect(backend.callsTo('/auth/logout')).toHaveLength(1);
    await waitForGuest(platform);
  });
});
