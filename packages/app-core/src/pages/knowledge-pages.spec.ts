import { createMemoryKeyValueStore, PlatformProvider, type Platform } from '@ai-engine/platform';
import { createInstance } from 'i18next';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createI18nOptions } from '../i18n/resources';
import enUSKnowledge from '../i18n/locales/en-US/knowledge.json';
import jaJPKnowledge from '../i18n/locales/ja-JP/knowledge.json';
import zhCNKnowledge from '../i18n/locales/zh-CN/knowledge.json';
import { KnowledgeDetailPage } from './knowledge-detail-page';
import { KnowledgeListPage, KnowledgeDatasetGrid } from './knowledge-list-page';
import {
  KnowledgeDocumentList,
  KnowledgeHitsTable,
  KnowledgePreviewBlocks,
} from './knowledge-panels';

const stubPlatform: Platform = {
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
  getAppInfo: async () => ({ name: 'test', version: '0.0.0' }),
  getSystemTheme: () => 'light',
  subscribeSystemTheme: () => () => undefined,
  window: {
    minimize: async () => undefined,
    maximize: async () => undefined,
    close: async () => undefined,
    reload: async () => undefined,
  },
};

const renderWithLocale = async (element: ReactElement, locale = 'zh-CN') => {
  const instance = createInstance();
  await instance.init(createI18nOptions(locale as 'zh-CN' | 'ja-JP' | 'en-US'));
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, element));
};

const leafKeys = (value: unknown, prefix = ''): string[] => {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix.length === 0 ? key : `${prefix}.${key}`),
  );
};

describe('knowledge i18n resources', () => {
  it('三种语言具有完全相同且非空的 key 树', () => {
    const resources = [zhCNKnowledge, jaJPKnowledge, enUSKnowledge];
    const expected = leafKeys(zhCNKnowledge).sort();
    for (const resource of resources) {
      expect(leafKeys(resource).sort()).toEqual(expected);
      expect(JSON.stringify(resource)).not.toContain('""');
    }
  });
});

describe('KnowledgeListPage', () => {
  it('渲染创建与加载入口', async () => {
    const html = await renderWithLocale(
      createElement(
        PlatformProvider,
        { value: stubPlatform },
        createElement(MemoryRouter, null, createElement(KnowledgeListPage)),
      ),
    );
    expect(html).toContain('知识库');
    expect(html).toContain('加载知识库');
    expect(html).toContain('创建');
  });

  it('en-US 渲染知识库标题与空态', async () => {
    const html = await renderWithLocale(
      createElement(
        PlatformProvider,
        { value: stubPlatform },
        createElement(MemoryRouter, null, createElement(KnowledgeListPage)),
      ),
      'en-US',
    );
    expect(html).toContain('Knowledge');
    expect(html).toContain('Load knowledge bases');
    expect(html).toContain('No knowledge bases yet');
  });

  it('en-US 对文档与切片计数应用复数规则', async () => {
    const html = await renderWithLocale(
      createElement(
        MemoryRouter,
        null,
        createElement(KnowledgeDatasetGrid, {
          datasets: [
            {
              id: '00000000-0000-4000-8000-000000000001',
              name: 'Untranslated dataset name',
              embeddingModel: 'nomic-embed-text:latest',
              chunkConfig: { strategy: 'recursive', chunkSize: 500, overlap: 50 },
              documentCount: 1,
              chunkCount: 2,
              createdAt: '2026-08-27T00:00:00.000Z',
            },
          ],
        }),
      ),
      'en-US',
    );
    expect(html).toContain('1 document');
    expect(html).toContain('2 chunks');
    expect(html).toContain('Untranslated dataset name');
  });
});

describe('KnowledgeDetailPage', () => {
  it('缺少 id 时提示', async () => {
    const html = await renderWithLocale(
      createElement(
        PlatformProvider,
        { value: stubPlatform },
        createElement(MemoryRouter, null, createElement(KnowledgeDetailPage)),
      ),
    );
    expect(html).toContain('缺少知识库 id');
  });

  it('详情页包含切分预览与检索测试', async () => {
    const html = await renderWithLocale(
      createElement(
        PlatformProvider,
        { value: stubPlatform },
        createElement(
          MemoryRouter,
          { initialEntries: ['/knowledge/00000000-0000-4000-8000-000000000001'] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: '/knowledge/:id',
              element: createElement(KnowledgeDetailPage),
            }),
          ),
        ),
      ),
    );
    expect(html).toContain('检索测试');
    expect(html).toContain('切分预览');
    expect(html).toContain('上传文档');
    expect(html).toContain('上传文件');
  });

  it('en-US 渲染详情页标题与检索空态', async () => {
    const html = await renderWithLocale(
      createElement(
        PlatformProvider,
        { value: stubPlatform },
        createElement(
          MemoryRouter,
          { initialEntries: ['/knowledge/00000000-0000-4000-8000-000000000001'] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: '/knowledge/:id',
              element: createElement(KnowledgeDetailPage),
            }),
          ),
        ),
      ),
      'en-US',
    );
    expect(html).toContain('Knowledge base details');
    expect(html).toContain('Chunk preview');
    expect(html).toContain('No retrieval results yet.');
  });
});

describe('knowledge panels', () => {
  it('渲染知识库卡片、文档、切片与命中', async () => {
    const dataset = {
      id: '00000000-0000-4000-8000-000000000001',
      name: '库',
      embeddingModel: 'nomic-embed-text:latest',
      chunkConfig: { strategy: 'recursive' as const, chunkSize: 500, overlap: 50 },
      documentCount: 1,
      chunkCount: 2,
      createdAt: '2026-08-27T00:00:00.000Z',
    };
    const grid = await renderWithLocale(
      createElement(
        MemoryRouter,
        null,
        createElement(KnowledgeDatasetGrid, { datasets: [dataset] }),
      ),
    );
    expect(grid).toContain('库');
    const documents = await renderWithLocale(
      createElement(KnowledgeDocumentList, {
        documents: [
          {
            id: '00000000-0000-4000-8000-000000000002',
            datasetId: dataset.id,
            name: 'a.md',
            sourceType: 'paste',
            status: 'failed',
            error: '扫描',
            charCountBefore: 0,
            charCountAfter: 0,
            failedStage: 'extract',
            createdAt: '2026-08-27T00:00:00.000Z',
          },
        ],
        onRemove: () => undefined,
      }),
    );
    expect(documents).toContain('扫描');
    expect(
      await renderWithLocale(
        createElement(KnowledgePreviewBlocks, {
          chunks: [{ position: 0, content: '北京', headingPath: '城市' }],
        }),
      ),
    ).toContain('城市');
    expect(
      await renderWithLocale(
        createElement(KnowledgeHitsTable, {
          hits: [
            {
              chunkId: '00000000-0000-4000-8000-000000000003',
              documentId: '00000000-0000-4000-8000-000000000002',
              documentName: 'a.md',
              content: '北京',
              score: 0.91,
              position: 0,
            },
          ],
        }),
      ),
    ).toContain('0.910');
  });
});
