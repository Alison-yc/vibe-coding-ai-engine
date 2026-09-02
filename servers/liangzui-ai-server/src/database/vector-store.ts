export const VECTOR_STORE = Symbol('VECTOR_STORE');

export type VectorChunkInsert = {
  documentId: string;
  documentName: string;
  datasetId: string;
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
  position: number;
};

export type VectorSearchHit = {
  id: string;
  documentId: string;
  documentName: string;
  content: string;
  score: number;
  position: number;
  headingPath?: string;
};

export interface VectorStore {
  seedIfEmpty(texts: string[], embed: () => Promise<number[][]>): Promise<void>;
  insert(chunks: VectorChunkInsert[]): Promise<void>;
  replaceDocumentChunks(documentId: string, chunks: VectorChunkInsert[]): Promise<void>;
  similaritySearch(
    embedding: number[],
    limit: number,
    datasetId?: string,
  ): Promise<VectorSearchHit[]>;
  deleteByDocumentId(documentId: string): Promise<void>;
}
