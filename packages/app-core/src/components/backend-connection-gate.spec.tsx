// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryKeyValueStore,
  PlatformProvider,
  readUiLocale,
  writeUiLocale,
  type Platform,
} from '@ai-engine/platform';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackendConnectionGate } from './backend-connection-gate';
import { AppI18nProvider } from '../i18n/i18n-provider';

const kv = createMemoryKeyValueStore();

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
  kv,
  getApiBaseUrl: () => 'http://localhost:3000',
  getUiLocale: () => readUiLocale(kv),
  setUiLocale: (locale) => writeUiLocale(kv, locale, () => undefined),
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
  vi.unstubAllGlobals();
  await kv.remove('ui.locale');
});

describe('BackendConnectionGate', () => {
  it('后端断开时显示引导，连接成功后进入应用', async () => {
    await writeUiLocale(kv, 'en-US', () => undefined);
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
        <AppI18nProvider>
          <BackendConnectionGate>
            <p>应用内容</p>
          </BackendConnectionGate>
        </AppI18nProvider>
      </PlatformProvider>,
    );

    expect(await screen.findByText('Unable to connect to the backend service')).toBeTruthy();
    expect(screen.getByText(/pnpm dev:db/)).toBeTruthy();
    expect(screen.getByDisplayValue('http://localhost:3000')).toBeTruthy();
    expect(screen.queryByText('应用内容')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save and test connection' }));
    expect(await screen.findByText('应用内容')).toBeTruthy();
    await expect(platform.kv.get('api.baseUrl')).resolves.toBe('http://localhost:3000');
  });
});
