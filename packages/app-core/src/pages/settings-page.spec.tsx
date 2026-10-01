// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryKeyValueStore,
  createMemorySecretStore,
  PlatformProvider,
  readUiLocale,
  writeUiLocale,
  type Platform,
} from '@ai-engine/platform';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './settings-page';
import { TestAuthProvider } from '../auth/test-auth';

const role = 'admin' as const;
import { AppI18nProvider } from '../i18n/i18n-provider';

const mocks = vi.hoisted(() => ({
  listServers: vi.fn(),
  listTools: vi.fn(),
  reconnect: vi.fn(),
  patch: vi.fn(),
  listExposed: vi.fn(),
}));

vi.mock('../mcp/mcp-api', () => ({
  listMcpServers: mocks.listServers,
  listMcpServerTools: mocks.listTools,
  reconnectMcpServer: mocks.reconnect,
  patchMcpServer: mocks.patch,
  listExposedAgentTools: mocks.listExposed,
}));

const kv = createMemoryKeyValueStore();
const platform = {
  capabilities: {
    nativeDirectoryPicker: false,
    windowControls: false,
    routerMode: 'history',
    devTools: true,
  },
  pickDirectory: async () => null,
  pickFiles: async () => [],
  kv,
  secrets: createMemorySecretStore(),
  getApiBaseUrl: () => 'http://localhost:3000',
  getUiLocale: () => readUiLocale(kv),
  setUiLocale: (locale) =>
    writeUiLocale(kv, locale, (next) => {
      document.documentElement.lang = next;
      document.documentElement.dir = 'ltr';
    }),
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

afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  await kv.remove('ui.locale');
  document.documentElement.lang = '';
  document.documentElement.dir = '';
});

describe('SettingsPage', () => {
  it('展示 MCP 连接状态并允许勾选工具', async () => {
    mocks.listServers.mockResolvedValue([
      {
        name: 'filesystem',
        type: 'stdio',
        enabled: true,
        status: 'connected',
        toolCount: 2,
        selectedToolCount: 1,
      },
    ]);
    mocks.listTools.mockResolvedValue([
      {
        name: 'read_file',
        description: '读取',
        exposedName: 'read_file',
        selected: true,
        permissionKind: 'read',
      },
      {
        name: 'write_file',
        description: '写入',
        exposedName: 'write_file',
        selected: false,
        permissionKind: 'write',
      },
    ]);
    mocks.listExposed.mockResolvedValue({
      tools: [{ name: 'read', description: '读取', source: 'builtin' }],
      dropped: [],
      maxToolCount: 6,
    });
    mocks.patch.mockResolvedValue({
      name: 'filesystem',
      type: 'stdio',
      enabled: true,
      status: 'connected',
      toolCount: 2,
      selectedToolCount: 2,
    });
    render(
      <PlatformProvider value={platform}>
        <AppI18nProvider>
          <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
          >
            <TestAuthProvider role={role}>
              <MemoryRouter initialEntries={['/settings']}>
                <Routes>
                  <Route path="/settings" element={<SettingsPage />} />
                </Routes>
              </MemoryRouter>
            </TestAuthProvider>
          </QueryClientProvider>
        </AppI18nProvider>
      </PlatformProvider>,
    );
    expect(await screen.findByText('已连接')).toBeTruthy();
    expect(screen.getByText('当前自动装配的工具')).toBeTruthy();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: 'write_file' }));
    expect(mocks.patch).toHaveBeenCalledWith(platform, 'filesystem', {
      toolFilter: { include: ['read_file', 'write_file'] },
    });
  });

  it('切换语言后立即更新设置页并持久化', async () => {
    mocks.listServers.mockResolvedValue([]);
    mocks.listExposed.mockResolvedValue({ tools: [], dropped: [], maxToolCount: 6 });
    render(
      <PlatformProvider value={platform}>
        <AppI18nProvider>
          <QueryClientProvider client={new QueryClient()}>
            <TestAuthProvider role={role}>
              <MemoryRouter>
                <SettingsPage />
              </MemoryRouter>
            </TestAuthProvider>
          </QueryClientProvider>
        </AppI18nProvider>
      </PlatformProvider>,
    );

    expect(await screen.findByRole('heading', { name: '设置' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '语言' })).toBeTruthy();
    const select = document.querySelector<HTMLSelectElement>('#settings-ui-locale');
    expect(select).not.toBeNull();
    fireEvent.change(select!, { target: { value: 'en-US' } });

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByText('No MCP server configured')).toBeTruthy();
    expect(screen.getByText('Automatically selected tools')).toBeTruthy();
    await waitFor(() => expect(document.documentElement.lang).toBe('en-US'));
    await expect(platform.getUiLocale()).resolves.toBe('en-US');
  });

  it('语言下拉不被卡片 overflow 裁切', async () => {
    mocks.listServers.mockResolvedValue([]);
    mocks.listExposed.mockResolvedValue({ tools: [], dropped: [], maxToolCount: 6 });
    render(
      <PlatformProvider value={platform}>
        <AppI18nProvider>
          <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
          >
            <TestAuthProvider role={role}>
              <MemoryRouter>
                <SettingsPage />
              </MemoryRouter>
            </TestAuthProvider>
          </QueryClientProvider>
        </AppI18nProvider>
      </PlatformProvider>,
    );

    const card = await screen.findByTestId('language-card');
    expect(card.className).toContain('overflow-visible');
    expect(card.className).not.toContain('overflow-hidden');

    fireEvent.click(await screen.findByRole('button', { name: '语言' }));
    const listbox = await screen.findByRole('listbox');
    expect(listbox).toBeTruthy();
    expect(screen.getByRole('option', { name: '中文' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '日本語' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'English' })).toBeTruthy();
  });

  it('按 ApiError code 本地化真实查询错误', async () => {
    await kv.set('ui.locale', 'en-US');
    mocks.listServers.mockRejectedValue(
      Object.assign(new Error('服务暂不可用'), { code: 'SERVICE_UNAVAILABLE' }),
    );
    mocks.listExposed.mockResolvedValue({ tools: [], dropped: [], maxToolCount: 6 });

    render(
      <PlatformProvider value={platform}>
        <AppI18nProvider>
          <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
          >
            <TestAuthProvider role={role}>
              <MemoryRouter>
                <SettingsPage />
              </MemoryRouter>
            </TestAuthProvider>
          </QueryClientProvider>
        </AppI18nProvider>
      </PlatformProvider>,
    );

    expect(
      await screen.findByText('The service is temporarily unavailable. Try again later.'),
    ).toBeTruthy();
  });
});

describe('SettingsPage 按角色门控', () => {
  const renderAs = (as: 'guest' | 'user') =>
    render(
      <PlatformProvider value={platform}>
        <AppI18nProvider>
          <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
          >
            <TestAuthProvider role={as}>
              <MemoryRouter>
                <SettingsPage />
              </MemoryRouter>
            </TestAuthProvider>
          </QueryClientProvider>
        </AppI18nProvider>
      </PlatformProvider>,
    );

  it('访客只看到本地设置与登录引导，不请求 MCP 与工具接口', async () => {
    renderAs('guest');
    expect(await screen.findByTestId('settings-login-guide')).toBeTruthy();
    expect(screen.getByTestId('language-card')).toBeTruthy();
    expect(screen.getByRole('link', { name: '去登录' }).getAttribute('href')).toBe(
      `/login?redirect=${encodeURIComponent('/settings')}`,
    );
    expect(mocks.listServers).not.toHaveBeenCalled();
    expect(mocks.listExposed).not.toHaveBeenCalled();
    expect(mocks.listTools).not.toHaveBeenCalled();
  });

  it('普通用户只读 MCP：能看到状态，不能勾选或重连', async () => {
    mocks.listServers.mockResolvedValue([
      {
        name: 'filesystem',
        type: 'stdio',
        enabled: true,
        status: 'connected',
        toolCount: 1,
        selectedToolCount: 0,
      },
    ]);
    mocks.listTools.mockResolvedValue([
      {
        name: 'write_file',
        description: '写入',
        exposedName: 'write_file',
        selected: false,
        permissionKind: 'write',
      },
    ]);
    mocks.listExposed.mockResolvedValue({ tools: [], dropped: [], maxToolCount: 6 });
    renderAs('user');

    const checkbox = await screen.findByRole('checkbox', { name: 'write_file' });
    expect((checkbox as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('mcp-read-only')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '重新连接' })).toBeNull();
    expect(screen.queryByTestId('settings-login-guide')).toBeNull();
    fireEvent.click(checkbox);
    expect(mocks.patch).not.toHaveBeenCalled();
  });
});
