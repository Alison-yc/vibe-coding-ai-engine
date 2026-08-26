import { randomUUID } from 'node:crypto';
import { EMBEDDING_DIMENSION } from '@ai-engine/contracts';
import type { VectorChunkInsert, VectorSearchHit, VectorStore } from './vector-store';

const cosineSimilarity = (left: number[], right: number[]): number => {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  return denominator === 0 ? 0 : dot / denominator;
};

export class InMemoryVectorStore implements VectorStore {
  private readonly chunks: Array<VectorSearchHit & { embedding: number[]; position: number }> = [];

  async seedIfEmpty(texts: string[], embed: () => Promise<number[][]>): Promise<void> {
    if (this.chunks.length > 0) return;
    const embeddings = await embed();
    if (embeddings.length !== texts.length) {
      throw new Error(`Embedding 条数不符：期望 ${texts.length}，实际 ${embeddings.length}`);
    }
    const documentId = randomUUID();
    texts.forEach((content, position) => {
      const embedding = embeddings[position];
      if (!embedding) {
        throw new Error(`缺少第 ${position} 条 Embedding`);
      }
      if (embedding.length !== EMBEDDING_DIMENSION) {
        throw new Error(
          `Embedding 维度不符：期望 ${EMBEDDING_DIMENSION}，实际 ${embedding.length}`,
        );
      }
      this.chunks.push({
        id: randomUUID(),
        documentId,
        content,
        embedding: [...embedding],
        score: 0,
        position,
      });
    });
  }

  async insert(chunks: VectorChunkInsert[]): Promise<void> {
    await Promise.resolve();
    for (const chunk of chunks) {
      if (chunk.embedding.length !== EMBEDDING_DIMENSION) {
        throw new Error(
          `Embedding 维度不符：期望 ${EMBEDDING_DIMENSION}，实际 ${chunk.embedding.length}`,
        );
      }
      this.chunks.push({
        id: randomUUID(),
        documentId: chunk.documentId,
        content: chunk.content,
        embedding: [...chunk.embedding],
        score: 0,
        position: chunk.position,
      });
    }
  }

  async similaritySearch(embedding: number[], limit: number): Promise<VectorSearchHit[]> {
    await Promise.resolve();
    return [...this.chunks]
      .map((chunk) => ({
        id: chunk.id,
        documentId: chunk.documentId,
        content: chunk.content,
        score: cosineSimilarity(embedding, chunk.embedding),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    await Promise.resolve();
    for (let index = this.chunks.length - 1; index >= 0; index -= 1) {
      if (this.chunks[index]?.documentId === documentId) this.chunks.splice(index, 1);
    }
  }
}
