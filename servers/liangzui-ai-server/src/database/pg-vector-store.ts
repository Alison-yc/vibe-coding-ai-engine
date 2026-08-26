import { EMBEDDING_DIMENSION } from '@ai-engine/contracts';
import { cosineDistance, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema';
import { chunks, datasets, documents } from './schema';
import type { VectorChunkInsert, VectorSearchHit, VectorStore } from './vector-store';

export type AppDatabase = NodePgDatabase<typeof schema>;

const DEMO_DATASET_NAME = 'demo-seed';

export class PgVectorStore implements VectorStore {
  constructor(private readonly db: AppDatabase) {}

  async seedIfEmpty(texts: string[], embed: () => Promise<number[][]>): Promise<void> {
    await this.db.transaction(async (tx) => {
      const existing = await tx.select({ id: chunks.id }).from(chunks).limit(1);
      if (existing.length > 0) return;

      const embeddings = await embed();
      if (embeddings.length !== texts.length) {
        throw new Error(`Embedding 条数不符：期望 ${texts.length}，实际 ${embeddings.length}`);
      }

      const [dataset] = await tx
        .insert(datasets)
        .values({
          name: DEMO_DATASET_NAME,
          embeddingModel: 'seed',
          chunkConfig: { strategy: 'seed' },
        })
        .returning();
      if (!dataset) throw new Error('无法创建演示知识库');

      const [document] = await tx
        .insert(documents)
        .values({
          datasetId: dataset.id,
          name: 'demo.txt',
          sourceType: 'seed',
          status: 'ready',
        })
        .returning();
      if (!document) throw new Error('无法创建演示文档');

      const store = new PgVectorStore(tx);
      await store.insert(
        texts.map((content, position) => {
          const embedding = embeddings[position];
          if (!embedding) {
            throw new Error(`缺少第 ${position} 条 Embedding`);
          }
          return {
            documentId: document.id,
            content,
            embedding,
            position,
          };
        }),
      );
    });
  }

  async insert(items: VectorChunkInsert[]): Promise<void> {
    if (items.length === 0) return;
    for (const item of items) {
      if (item.embedding.length !== EMBEDDING_DIMENSION) {
        throw new Error(
          `Embedding 维度不符：期望 ${EMBEDDING_DIMENSION}，实际 ${item.embedding.length}`,
        );
      }
    }
    await this.db.insert(chunks).values(
      items.map((item) => ({
        documentId: item.documentId,
        content: item.content,
        embedding: item.embedding,
        metadata: item.metadata ?? {},
        position: item.position,
      })),
    );
  }

  async similaritySearch(embedding: number[], limit: number): Promise<VectorSearchHit[]> {
    if (embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(`查询向量维度不符：期望 ${EMBEDDING_DIMENSION}，实际 ${embedding.length}`);
    }
    const distance = cosineDistance(chunks.embedding, embedding);
    const rows = await this.db
      .select({
        id: chunks.id,
        documentId: chunks.documentId,
        content: chunks.content,
        distance,
      })
      .from(chunks)
      .orderBy(distance)
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      content: row.content,
      score: 1 - Number(row.distance),
    }));
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    await this.db.delete(chunks).where(eq(chunks.documentId, documentId));
  }
}
