import { EMBEDDING_DIMENSION } from '@ai-engine/contracts';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgVectorStore } from '../../src/database/pg-vector-store';
import * as schema from '../../src/database/schema';
import { datasets, documents } from '../../src/database/schema';
import { withTransaction } from '../../src/database/with-transaction';

const databaseUrl = process.env.DATABASE_URL;

const unit = (hotIndex: number): number[] =>
  Array.from({ length: EMBEDDING_DIMENSION }, (_, index) => (index === hotIndex ? 1 : 0));

describe('PgVectorStore integration', () => {
  let pool: Pool;

  beforeAll(() => {
    if (!databaseUrl) {
      throw new Error('集成测试需要 DATABASE_URL');
    }
    pool = new Pool({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    await pool?.end();
  });

  const searchOnce = async (): Promise<string | undefined> => {
    const db = drizzle(pool, { schema });
    return withTransaction(db, async (tx) => {
      const store = new PgVectorStore(tx);
      const [dataset] = await tx
        .insert(datasets)
        .values({
          name: 'integration',
          embeddingModel: 'test',
          chunkConfig: {},
        })
        .returning();
      if (!dataset) throw new Error('无法创建知识库');
      const [document] = await tx
        .insert(documents)
        .values({
          datasetId: dataset.id,
          name: 'a.txt',
          sourceType: 'test',
          status: 'ready',
        })
        .returning();
      if (!document) throw new Error('无法创建文档');

      await store.insert([
        {
          documentId: document.id,
          documentName: document.name,
          datasetId: dataset.id,
          content: '我住在北京',
          embedding: unit(0),
          position: 0,
        },
        {
          documentId: document.id,
          documentName: document.name,
          datasetId: dataset.id,
          content: '我喜欢编程',
          embedding: unit(1),
          position: 1,
        },
      ]);

      const hits = await store.similaritySearch(unit(0), 1);
      return hits[0]?.content;
    });
  };

  it('插入向量后按余弦距离检索', async () => {
    await expect(searchOnce()).resolves.toBe('我住在北京');
  });

  it('事务回滚隔离：再跑一遍结果一致', async () => {
    await expect(searchOnce()).resolves.toBe('我住在北京');
  });

  it('插入错误维度时失败', async () => {
    const db = drizzle(pool, { schema });
    await expect(
      withTransaction(db, async (tx) => {
        const store = new PgVectorStore(tx);
        const [dataset] = await tx
          .insert(datasets)
          .values({
            name: 'bad-dim',
            embeddingModel: 'test',
            chunkConfig: {},
          })
          .returning();
        if (!dataset) throw new Error('无法创建知识库');
        const [document] = await tx
          .insert(documents)
          .values({
            datasetId: dataset.id,
            name: 'b.txt',
            sourceType: 'test',
            status: 'ready',
          })
          .returning();
        if (!document) throw new Error('无法创建文档');
        await store.insert([
          {
            documentId: document.id,
            documentName: document.name,
            datasetId: dataset.id,
            content: 'bad',
            embedding: [0, 1],
            position: 0,
          },
        ]);
      }),
    ).rejects.toThrow('Embedding 维度不符');
  });
});
