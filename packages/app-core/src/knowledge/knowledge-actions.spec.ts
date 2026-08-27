import { createMemoryKeyValueStore, type Platform } from '@ai-engine/platform';
import { describe, expect, it, vi } from 'vitest';
import * as api from './knowledge-api';
import {
  createKnowledgeDataset,
  createKnowledgeListError,
  createKnowledgeListHandlers,
  loadKnowledgeListError,
  refreshKnowledgeList,
} from './knowledge-list-actions';
import {
  createKnowledgeDetailHandlers,
  indexPastedDocument,
  indexUploadedDocument,
  knowledgeActionError,
  loadKnowledgeDetail,
  previewKnowledgeSplit,
  removeKnowledgeDocument,
  runKnowledgeAnswer,
  runKnowledgeRetrieve,
} from './knowledge-detail-actions';

vi.mock('./knowledge-api');

const platform = {
  getApiBaseUrl: () => 'http://localhost:3000',
  kv: createMemoryKeyValueStore(),
} as Platform;

const dataset = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '库',
  embeddingModel: 'nomic-embed-text:latest',
  chunkConfig: { strategy: 'recursive' as const, chunkSize: 500, overlap: 50 },
  documentCount: 1,
  chunkCount: 1,
  createdAt: '2026-08-27T00:00:00.000Z',
};

const document = {
  id: '00000000-0000-4000-8000-000000000002',
  datasetId: dataset.id,
  name: 'a.md',
  sourceType: 'paste' as const,
  status: 'completed' as const,
  error: null,
  charCountBefore: 2,
  charCountAfter: 2,
  failedStage: null,
  createdAt: '2026-08-27T00:00:00.000Z',
};

describe('knowledge-list-actions', () => {
  it('刷新与创建会调用 API', async () => {
    vi.mocked(api.listDatasets).mockResolvedValue([dataset]);
    vi.mocked(api.createDataset).mockResolvedValue(dataset);
    await expect(refreshKnowledgeList(platform)).resolves.toEqual([dataset]);
    await createKnowledgeDataset(platform, '库');
    expect(api.createDataset).toHaveBeenCalledWith(platform, { name: '库' });
  });

  it('错误文案区分 Error 与其它值', () => {
    expect(loadKnowledgeListError(new Error('x'))).toBe('x');
    expect(loadKnowledgeListError('x')).toBe('加载失败');
    expect(createKnowledgeListError(new Error('y'))).toBe('y');
    expect(createKnowledgeListError(1)).toBe('创建失败');
  });
});

describe('knowledge-detail-actions', () => {
  it('加载详情、粘贴、上传、删除、预览、检索与试答', async () => {
    vi.mocked(api.getDataset).mockResolvedValue(dataset);
    vi.mocked(api.listDocuments).mockResolvedValue([document]);
    vi.mocked(api.createPasteDocument).mockResolvedValue(document);
    vi.mocked(api.uploadDocument).mockResolvedValue(document);
    vi.mocked(api.waitForDocument).mockResolvedValue(document);
    vi.mocked(api.deleteDocument).mockResolvedValue(undefined);
    vi.mocked(api.previewSplit).mockResolvedValue({ chunks: [{ position: 0, content: '北京' }] });
    vi.mocked(api.retrieveDataset).mockResolvedValue({
      hits: [
        {
          chunkId: '00000000-0000-4000-8000-000000000003',
          documentId: document.id,
          documentName: 'a.md',
          content: '北京',
          score: 0.9,
          position: 0,
        },
      ],
    });
    vi.mocked(api.answerDataset).mockResolvedValue({
      answer: '资料中没有相关信息',
      citations: [],
    });

    await expect(loadKnowledgeDetail(platform, dataset.id)).resolves.toEqual({
      dataset,
      documents: [document],
    });
    await expect(indexPastedDocument(platform, dataset.id, 'a.md', '北京')).resolves.toEqual(
      document,
    );
    await expect(
      indexUploadedDocument(platform, dataset.id, new File(['x'], 'a.txt')),
    ).resolves.toEqual(document);
    await removeKnowledgeDocument(platform, document.id);
    await expect(
      previewKnowledgeSplit(platform, dataset.id, '北京', {
        strategy: 'recursive',
        chunkSize: 500,
        overlap: 50,
      }),
    ).resolves.toMatchObject({ chunks: [{ content: '北京' }] });
    await expect(runKnowledgeRetrieve(platform, dataset.id, '北京')).resolves.toMatchObject({
      answer: null,
    });
    await expect(runKnowledgeAnswer(platform, dataset.id, '北京')).resolves.toMatchObject({
      answer: '资料中没有相关信息',
    });
    expect(knowledgeActionError(new Error('e'), 'fallback')).toBe('e');
    expect(knowledgeActionError(0, 'fallback')).toBe('fallback');
  });

  it('列表 handlers 会写回状态', async () => {
    vi.mocked(api.listDatasets).mockResolvedValue([dataset]);
    vi.mocked(api.createDataset).mockResolvedValue(dataset);
    const setters = {
      name: '库',
      setName: vi.fn(),
      setDatasets: vi.fn(),
      setError: vi.fn(),
      setLoading: vi.fn(),
    };
    const handlers = createKnowledgeListHandlers(platform, setters);
    handlers.onNameChange({ target: { value: '新' } });
    expect(setters.setName).toHaveBeenCalledWith('新');
    await handlers.refresh();
    expect(setters.setDatasets).toHaveBeenCalledWith([dataset]);
    handlers.onRefreshClick();
    handlers.onCreateClick();
    await handlers.create();
    expect(api.createDataset).toHaveBeenCalled();
    vi.mocked(api.listDatasets).mockRejectedValueOnce('x');
    await handlers.refresh();
    expect(setters.setError).toHaveBeenCalledWith('加载失败');
    vi.mocked(api.createDataset).mockRejectedValueOnce(new Error('创建失败了'));
    await handlers.create();
    expect(setters.setError).toHaveBeenCalledWith('创建失败了');
  });

  it('详情 handlers 覆盖输入、粘贴失败与上传空文件', async () => {
    vi.mocked(api.getDataset).mockResolvedValue(dataset);
    vi.mocked(api.listDocuments).mockResolvedValue([document]);
    vi.mocked(api.waitForDocument).mockResolvedValue({
      ...document,
      status: 'failed',
      error: '坏了',
    });
    vi.mocked(api.createPasteDocument).mockResolvedValue(document);
    vi.mocked(api.uploadDocument).mockResolvedValue(document);
    vi.mocked(api.deleteDocument).mockResolvedValue(undefined);
    vi.mocked(api.previewSplit).mockResolvedValue({ chunks: [] });
    vi.mocked(api.retrieveDataset).mockResolvedValue({ hits: [] });
    vi.mocked(api.answerDataset).mockResolvedValue({ answer: '资料中没有相关信息', citations: [] });
    const setters = {
      pasteName: 'a.md',
      pasteText: '北京',
      previewText: '北京',
      query: '北京',
      chunkConfig: { strategy: 'recursive' as const, chunkSize: 500, overlap: 50 },
      setDataset: vi.fn(),
      setDocuments: vi.fn(),
      setPasteName: vi.fn(),
      setPasteText: vi.fn(),
      setPreviewText: vi.fn(),
      setChunkSize: vi.fn(),
      setOverlap: vi.fn(),
      setStrategy: vi.fn(),
      setPreviewChunks: vi.fn(),
      setQuery: vi.fn(),
      setHits: vi.fn(),
      setAnswer: vi.fn(),
      setError: vi.fn(),
    };
    const handlers = createKnowledgeDetailHandlers(platform, dataset.id, setters);
    handlers.onPasteNameChange({ target: { value: 'b.md' } });
    handlers.onPasteTextChange({ target: { value: 'x' } });
    handlers.onPreviewTextChange({ target: { value: 'y' } });
    handlers.onStrategyChange({ target: { value: 'fixed' } });
    handlers.onChunkSizeChange({ target: { value: '100' } });
    handlers.onOverlapChange({ target: { value: '10' } });
    handlers.onQueryChange({ target: { value: 'q' } });
    await handlers.refresh();
    await handlers.paste();
    expect(setters.setError).toHaveBeenCalledWith('坏了');
    await handlers.upload({ target: { files: null } });
    await handlers.upload({
      target: { files: { 0: new File(['x'], 'a.txt'), length: 1 } as unknown as FileList },
    });
    await handlers.remove(document.id);
    await handlers.removeFromEvent({
      currentTarget: { getAttribute: () => document.id },
    });
    await handlers.removeFromEvent({ currentTarget: { getAttribute: () => null } });
    await handlers.preview();
    await handlers.retrieve();
    await handlers.answer();
    handlers.onRefreshClick();
    handlers.onPasteClick();
    handlers.onUploadChange({ target: { files: null } });
    handlers.onRemoveClick({ currentTarget: { getAttribute: () => null } });
    handlers.onPreviewClick();
    handlers.onRetrieveClick();
    handlers.onAnswerClick();
    vi.mocked(api.createPasteDocument).mockRejectedValueOnce('bad');
    await handlers.paste();
    expect(setters.setError).toHaveBeenCalledWith('上传失败');
    vi.mocked(api.uploadDocument).mockRejectedValueOnce(new Error('上传挂了'));
    await handlers.upload({
      target: { files: { 0: new File(['x'], 'a.txt'), length: 1 } as unknown as FileList },
    });
    expect(setters.setError).toHaveBeenCalledWith('上传挂了');
  });
});
