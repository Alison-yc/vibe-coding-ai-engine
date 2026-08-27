// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryKeyValueStore, PlatformProvider, type Platform } from '@ai-engine/platform';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './settings-page';

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

const platform = {
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <MemoryRouter initialEntries={['/settings']}>
            <Routes>
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </PlatformProvider>,
    );
    expect(await screen.findByText('已连接')).toBeTruthy();
    expect(screen.getByText('当前暴露给模型的工具')).toBeTruthy();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: 'write_file' }));
    expect(mocks.patch).toHaveBeenCalledWith(platform, 'filesystem', {
      toolFilter: { include: ['read_file', 'write_file'] },
    });
  });
});
