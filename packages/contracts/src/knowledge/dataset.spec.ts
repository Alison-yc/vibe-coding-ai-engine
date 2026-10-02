import { describe, expect, it } from 'vitest';
import {
  ChunkConfigSchema,
  CreateDatasetRequestSchema,
  DEFAULT_CHUNK_CONFIG,
  KNOWLEDGE_EMPTY_ANSWER,
  DocumentStatusSchema,
  RetrieveRequestSchema,
} from './dataset.js';

describe('knowledge contracts', () => {
  it('默认切分配置为 recursive 500/50', () => {
    expect(DEFAULT_CHUNK_CONFIG).toEqual({
      strategy: 'recursive',
      chunkSize: 500,
      overlap: 50,
    });
  });

  it('拒绝 overlap 不小于 chunkSize 的配置', () => {
    expect(
      ChunkConfigSchema.safeParse({ strategy: 'fixed', chunkSize: 100, overlap: 100 }).success,
    ).toBe(false);
  });

  it('创建知识库请求允许省略 chunkConfig', () => {
    expect(CreateDatasetRequestSchema.parse({ name: ' 测试库 ' }).name).toBe('测试库');
  });

  it('检索请求补齐 topK 与阈值默认值', () => {
    expect(RetrieveRequestSchema.parse({ query: '北京' })).toMatchObject({
      topK: 5,
      scoreThreshold: 0.3,
    });
  });

  it('空对象补齐默认切分配置', () => {
    expect(ChunkConfigSchema.parse({})).toEqual(DEFAULT_CHUNK_CONFIG);
  });

  it('文档状态覆盖五阶段进度', () => {
    expect(
      ['extracting', 'cleaning', 'splitting', 'embedding', 'indexing'].every(
        (status) => DocumentStatusSchema.safeParse(status).success,
      ),
    ).toBe(true);
  });

  it('空检索回答文案固定', () => {
    expect(KNOWLEDGE_EMPTY_ANSWER).toBe('资料中没有相关信息');
  });
});
