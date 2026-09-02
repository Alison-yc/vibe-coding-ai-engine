import { createMemoryKeyValueStore, type Platform } from '@ai-engine/platform';
import { describe, expect, it, vi } from 'vitest';
import {
  answerDataset,
  createDataset,
  createPasteDocument,
  deleteDataset,
  deleteDocument,
  getDataset,
  getDocument,
  listDatasets,
  listDocuments,
  previewSplit,
  retrieveDataset,
  uploadDocument,
  waitForDocument,
} from './knowledge-api';

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
  getApiBaseUrl: () => 'http://localhost:3000/',
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

const dataset = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '测试知识库',
  embeddingModel: 'nomic-embed-text:latest',
  chunkConfig: { strategy: 'recursive', chunkSize: 500, overlap: 50 },
  documentCount: 0,
  chunkCount: 0,
  createdAt: '2026-08-27T00:00:00.000Z',
};

const document = {
  id: '00000000-0000-4000-8000-000000000002',
  datasetId: dataset.id,
  name: 'a.md',
  sourceType: 'paste',
  status: 'completed',
  error: null,
  charCountBefore: 3,
  charCountAfter: 3,
  failedStage: null,
  createdAt: '2026-08-27T00:00:00.000Z',
};

describe('knowledge-api', () => {
  it('解析列表与创建响应', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [dataset],
      }),
    );
    await expect(listDatasets(stubPlatform)).resolves.toEqual([dataset]);
    vi.unstubAllGlobals();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => dataset,
      }),
    );
    await expect(createDataset(stubPlatform, { name: '测试知识库' })).resolves.toEqual(dataset);
    await expect(getDataset(stubPlatform, dataset.id)).resolves.toEqual(dataset);
    vi.unstubAllGlobals();
  });

  it('删除知识库使用 DELETE 请求', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(deleteDataset(stubPlatform, dataset.id)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/knowledge/datasets/${dataset.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
    vi.unstubAllGlobals();
  });

  it('上传走 FormData 且不强制 JSON Content-Type', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => document,
    });
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['hello'], 'a.txt', { type: 'text/plain' });
    await expect(uploadDocument(stubPlatform, dataset.id, file)).resolves.toMatchObject({
      name: 'a.md',
    });
    const init = fetchMock.mock.calls[0]?.[1] as { body?: unknown };
    expect(init.body).toBeInstanceOf(FormData);
    vi.unstubAllGlobals();
  });

  it('失败时保留 ApiError code 与 message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ code: 'PAYLOAD_TOO_LARGE', message: '文件太大' }),
      }),
    );
    await expect(listDatasets(stubPlatform)).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      message: '文件太大',
    });
    vi.unstubAllGlobals();
  });

  it('失败体无 message 时回退状态码', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      }),
    );
    await expect(listDocuments(stubPlatform, dataset.id)).rejects.toThrow('HTTP 500');
    vi.unstubAllGlobals();
  });

  it('文档与检索接口走契约解析', async () => {
    const hit = {
      chunkId: '00000000-0000-4000-8000-000000000003',
      documentId: document.id,
      documentName: 'a.md',
      content: '北京',
      score: 0.9,
      position: 0,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => document,
      }),
    );
    await expect(
      createPasteDocument(stubPlatform, dataset.id, { name: 'a.md', text: '北京' }),
    ).resolves.toEqual(document);
    await expect(getDocument(stubPlatform, document.id)).resolves.toEqual(document);
    await expect(deleteDocument(stubPlatform, document.id)).resolves.toBeUndefined();
    vi.unstubAllGlobals();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ chunks: [{ position: 0, content: '北京' }] }),
      }),
    );
    await expect(previewSplit(stubPlatform, dataset.id, { text: '北京' })).resolves.toMatchObject({
      chunks: [{ content: '北京' }],
    });
    vi.unstubAllGlobals();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ hits: [hit] }),
      }),
    );
    await expect(
      retrieveDataset(stubPlatform, dataset.id, { query: '北京', topK: 5, scoreThreshold: 0.3 }),
    ).resolves.toMatchObject({ hits: [hit] });
    vi.unstubAllGlobals();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answer: '资料中没有相关信息', citations: [] }),
      }),
    );
    await expect(
      answerDataset(stubPlatform, dataset.id, { query: '没有', topK: 5, scoreThreshold: 0.3 }),
    ).resolves.toMatchObject({ citations: [] });
    vi.unstubAllGlobals();
  });

  it('waitForDocument 在终态停止，超时后仍返回最后一次查询', async () => {
    const pending = { ...document, status: 'pending' as const };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => pending,
      }),
    );
    await expect(
      waitForDocument(stubPlatform, document.id, { attempts: 2, delayMs: 0 }),
    ).resolves.toMatchObject({ status: 'pending' });
    vi.unstubAllGlobals();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => document,
      }),
    );
    await expect(
      waitForDocument(stubPlatform, document.id, { attempts: 1, delayMs: 0 }),
    ).resolves.toMatchObject({
      status: 'completed',
    });
    vi.unstubAllGlobals();
  });
});
