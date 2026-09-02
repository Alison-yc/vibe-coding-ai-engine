// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryKeyValueStore, PlatformProvider, type Platform } from '@ai-engine/platform';
import { createInstance } from 'i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { createI18nOptions } from '../i18n/resources';
import { KnowledgeListPage } from './knowledge-list-page';

const mocks = vi.hoisted(() => ({
  listDatasets: vi.fn(),
  createDataset: vi.fn(),
  deleteDataset: vi.fn(),
}));

vi.mock('../knowledge/knowledge-api', () => mocks);

const platform: Platform = {
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
};

const dataset = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '产品知识库',
  embeddingModel: 'nomic-embed-text:latest',
  chunkConfig: { strategy: 'recursive' as const, chunkSize: 500, overlap: 50 },
  documentCount: 1,
  chunkCount: 2,
  createdAt: '2026-08-30T00:00:00.000Z',
};

const i18n = createInstance();

beforeAll(async () => {
  await i18n.init(createI18nOptions('zh-CN'));
});

beforeEach(() => {
  mocks.listDatasets.mockResolvedValue([]);
  mocks.createDataset.mockResolvedValue(dataset);
  mocks.deleteDataset.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderPage = () =>
  render(
    <PlatformProvider value={platform}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <KnowledgeListPage />
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>
    </PlatformProvider>,
  );

describe('KnowledgeListPage', () => {
  it('进入页面自动加载，空态只有一个创建按钮', async () => {
    renderPage();
    await waitFor(() => expect(mocks.listDatasets).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('还没有知识库')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '创建' })).toHaveLength(1);
  });

  it('删除知识库前要求二次确认', async () => {
    mocks.listDatasets.mockResolvedValue([dataset]);
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText(dataset.name)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '删除' }));
    expect(mocks.deleteDataset).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(mocks.deleteDataset).toHaveBeenCalledWith(platform, dataset.id));
  });
});
