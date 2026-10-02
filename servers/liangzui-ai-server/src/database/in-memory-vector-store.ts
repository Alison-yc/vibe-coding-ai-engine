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

type StoredChunk = VectorSearchHit & { embedding: number[]; datasetId: string };

export class InMemoryVectorStore implements VectorStore {
  private readonly chunks: StoredChunk[] = [];

  async seedIfEmpty(texts: string[], embed: () => Promise<number[][]>): Promise<void> {
    if (this.chunks.length > 0) return;
    const embeddings = await embed();
    if (embeddings.length !== texts.length) {
      throw new Error(`Embedding 条数不符：期望 ${texts.length}，实际 ${embeddings.length}`);
    }
    const documentId = randomUUID();
    const datasetId = randomUUID();
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
        documentName: 'demo.txt',
        datasetId,
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
      const headingPath =
        typeof chunk.metadata?.headingPath === 'string' ? chunk.metadata.headingPath : undefined;
      this.chunks.push({
        id: randomUUID(),
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        datasetId: chunk.datasetId,
        content: chunk.content,
        embedding: [...chunk.embedding],
        score: 0,
        position: chunk.position,
        headingPath,
      });
    }
  }

  async replaceDocumentChunks(documentId: string, chunks: VectorChunkInsert[]): Promise<void> {
    const replacements = chunks.map((chunk) => {
      if (chunk.documentId !== documentId) {
        throw new Error('替换切片的 documentId 不一致');
      }
      if (chunk.embedding.length !== EMBEDDING_DIMENSION) {
        throw new Error(
          `Embedding 维度不符：期望 ${EMBEDDING_DIMENSION}，实际 ${chunk.embedding.length}`,
        );
      }
      const headingPath =
        typeof chunk.metadata?.headingPath === 'string' ? chunk.metadata.headingPath : undefined;
      return {
        id: randomUUID(),
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        datasetId: chunk.datasetId,
        content: chunk.content,
        embedding: [...chunk.embedding],
        score: 0,
        position: chunk.position,
        headingPath,
      };
    });
    await this.deleteByDocumentId(documentId);
    this.chunks.push(...replacements);
  }

  async similaritySearch(
    embedding: number[],
    limit: number,
    datasetId?: string,
  ): Promise<VectorSearchHit[]> {
    await Promise.resolve();
    return this.chunks
      .filter((chunk) => !datasetId || chunk.datasetId === datasetId)
      .map((chunk) => ({
        id: chunk.id,
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        content: chunk.content,
        score: cosineSimilarity(embedding, chunk.embedding),
        position: chunk.position,
        headingPath: chunk.headingPath,
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
