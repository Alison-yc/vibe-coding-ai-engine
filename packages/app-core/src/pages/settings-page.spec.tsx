// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryKeyValueStore,
  PlatformProvider,
  readUiLocale,
  writeUiLocale,
  type Platform,
} from '@ai-engine/platform';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './settings-page';
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
            <MemoryRouter initialEntries={['/settings']}>
              <Routes>
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </MemoryRouter>
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
            <MemoryRouter>
              <SettingsPage />
            </MemoryRouter>
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
});
