import { EMBEDDING_DIMENSION } from '@ai-engine/contracts';
import { describe, expect, it, vi } from 'vitest';
import { PgVectorStore } from './pg-vector-store';

describe('PgVectorStore', () => {
  it('写入或查询前校验向量维度，不发 SQL', async () => {
    const store = new PgVectorStore({} as never);
    await expect(
      store.insert([
        {
          documentId: '00000000-0000-4000-8000-000000000001',
          content: 'x',
          embedding: [1, 2],
          position: 0,
        },
      ]),
    ).rejects.toThrow('Embedding 维度不符');
    await expect(store.similaritySearch([1, 2], 1)).rejects.toThrow('查询向量维度不符');
  });

  it('seedIfEmpty 在事务内写入，条数不符时不插入', async () => {
    const tx = {
      select: () => ({ from: () => ({ limit: async () => [] }) }),
      insert: vi.fn(),
    };
    const db = {
      transaction: vi.fn(async (run) => run(tx)),
    };
    const store = new PgVectorStore(db as never);
    await expect(store.seedIfEmpty(['a'], async () => [])).rejects.toThrow('Embedding 条数不符');
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('seedIfEmpty 把 dataset/document/chunks 包进同一事务', async () => {
    let insertCount = 0;
    const tx = {
      select: () => ({ from: () => ({ limit: async () => [] }) }),
      insert: vi.fn(() => {
        insertCount += 1;
        if (insertCount <= 2) {
          return { values: () => ({ returning: async () => [{ id: `id-${insertCount}` }] }) };
        }
        return { values: vi.fn().mockResolvedValue(undefined) };
      }),
    };
    const db = {
      transaction: vi.fn(async (run) => run(tx)),
    };
    const store = new PgVectorStore(db as never);
    const embedding = Array.from({ length: EMBEDDING_DIMENSION }, () => 0);
    await store.seedIfEmpty(['hello'], async () => [embedding]);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(insertCount).toBe(3);
  });
});
