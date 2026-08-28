// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryKeyValueStore, PlatformProvider, type Platform } from '@ai-engine/platform';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackendConnectionGate } from './backend-connection-gate';

const platform = {
  capabilities: {
    nativeDirectoryPicker: false,
    windowControls: false,
    routerMode: 'hash',
    devTools: false,
    backendConnectionSetup: true,
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
  vi.unstubAllGlobals();
});

describe('BackendConnectionGate', () => {
  it('后端断开时显示引导，连接成功后进入应用', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'ok',
          chatModel: 'qwen3.5:2b',
          embeddingModel: 'nomic-embed-text',
          numCtx: 4096,
          numPredict: 1024,
          temperature: 0.2,
          vectorStore: 'postgres',
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <PlatformProvider value={platform}>
        <BackendConnectionGate>
          <p>应用内容</p>
        </BackendConnectionGate>
      </PlatformProvider>,
    );

    expect(await screen.findByText('无法连接到后端服务')).toBeTruthy();
    expect(screen.queryByText('应用内容')).toBeNull();
    await user.click(screen.getByRole('button', { name: '保存并测试连接' }));
    expect(await screen.findByText('应用内容')).toBeTruthy();
    await expect(platform.kv.get('api.baseUrl')).resolves.toBe('http://localhost:3000');
  });
});
