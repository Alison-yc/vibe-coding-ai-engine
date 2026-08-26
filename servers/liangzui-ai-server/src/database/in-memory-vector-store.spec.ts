import { EMBEDDING_DIMENSION } from '@ai-engine/contracts';
import { describe, expect, it } from 'vitest';
import { InMemoryVectorStore } from './in-memory-vector-store';

describe('InMemoryVectorStore', () => {
  it('按余弦相似度召回并支持按文档删除', async () => {
    const store = new InMemoryVectorStore();
    await store.seedIfEmpty(['北京', '编程'], async () => [
      Array.from({ length: EMBEDDING_DIMENSION }, (_, index) => (index === 0 ? 1 : 0)),
      Array.from({ length: EMBEDDING_DIMENSION }, (_, index) => (index === 1 ? 1 : 0)),
    ]);
    const query = Array.from({ length: EMBEDDING_DIMENSION }, (_, index) => (index === 0 ? 1 : 0));
    const hits = await store.similaritySearch(query, 1);
    expect(hits[0]?.content).toBe('北京');

    await store.deleteByDocumentId(hits[0]?.documentId ?? '');
    await expect(store.similaritySearch(query, 1)).resolves.toEqual([]);
  });

  it('seed 条数不符时抛错', async () => {
    const store = new InMemoryVectorStore();
    await expect(store.seedIfEmpty(['北京'], async () => [])).rejects.toThrow('Embedding 条数不符');
  });

  it('插入维度错误时抛错', async () => {
    const store = new InMemoryVectorStore();
    await expect(
      store.insert([
        {
          documentId: '00000000-0000-4000-8000-000000000001',
          content: 'x',
          embedding: [1],
          position: 0,
        },
      ]),
    ).rejects.toThrow('Embedding 维度不符');
  });
});
