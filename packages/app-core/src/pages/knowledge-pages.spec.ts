import { createMemoryKeyValueStore, PlatformProvider, type Platform } from '@ai-engine/platform';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
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

describe('KnowledgeListPage', () => {
  it('渲染创建与加载入口', () => {
    const html = renderToStaticMarkup(
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
});

describe('KnowledgeDetailPage', () => {
  it('缺少 id 时提示', () => {
    const html = renderToStaticMarkup(
      createElement(PlatformProvider, { value: stubPlatform }, createElement(KnowledgeDetailPage)),
    );
    expect(html).toContain('缺少知识库 id');
  });

  it('详情页包含切分预览与检索测试', () => {
    const html = renderToStaticMarkup(
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
    expect(html).toContain('检索测试（不经过 LLM）');
    expect(html).toContain('切分预览');
    expect(html).toContain('上传 txt / md / pdf');
  });
});

describe('knowledge panels', () => {
  it('渲染知识库卡片、文档、切片与命中', () => {
    const dataset = {
      id: '00000000-0000-4000-8000-000000000001',
      name: '库',
      embeddingModel: 'nomic-embed-text:latest',
      chunkConfig: { strategy: 'recursive' as const, chunkSize: 500, overlap: 50 },
      documentCount: 1,
      chunkCount: 2,
      createdAt: '2026-08-27T00:00:00.000Z',
    };
    const grid = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(KnowledgeDatasetGrid, { datasets: [dataset] }),
      ),
    );
    expect(grid).toContain('库');
    const documents = renderToStaticMarkup(
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
      renderToStaticMarkup(
        createElement(KnowledgePreviewBlocks, {
          chunks: [{ position: 0, content: '北京', headingPath: '城市' }],
        }),
      ),
    ).toContain('城市');
    expect(
      renderToStaticMarkup(
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
