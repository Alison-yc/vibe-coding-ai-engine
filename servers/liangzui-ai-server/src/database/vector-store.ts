export const VECTOR_STORE = Symbol('VECTOR_STORE');

export type VectorChunkInsert = {
  documentId: string;
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
  position: number;
};

export type VectorSearchHit = {
  id: string;
  documentId: string;
  content: string;
  score: number;
};

export interface VectorStore {
  seedIfEmpty(texts: string[], embed: () => Promise<number[][]>): Promise<void>;
  insert(chunks: VectorChunkInsert[]): Promise<void>;
  similaritySearch(embedding: number[], limit: number): Promise<VectorSearchHit[]>;
  deleteByDocumentId(documentId: string): Promise<void>;
}
