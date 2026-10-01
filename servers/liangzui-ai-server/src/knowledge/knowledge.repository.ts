import { randomUUID } from 'node:crypto';
import {
  ChunkConfigSchema,
  DEFAULT_CHUNK_CONFIG,
  DatasetSchema,
  KnowledgeDocumentSchema,
  type ChunkConfig,
  type Dataset,
  type DocumentSourceType,
  type DocumentStatus,
  type IndexStage,
  type KnowledgeDocument,
  type SplitPreviewChunk,
} from '@ai-engine/contracts';
import { and, count, eq, inArray } from 'drizzle-orm';
import { chunks, datasets, documents } from '../database/schema';
import type { AppDatabase } from '../database/pg-vector-store';

export const KNOWLEDGE_REPOSITORY = Symbol('KNOWLEDGE_REPOSITORY');

export type NewDocumentInput = {
  datasetId: string;
  name: string;
  sourceType: DocumentSourceType;
  extractedText?: string | null;
  sourceBytes?: Uint8Array | null;
  status?: DocumentStatus;
  error?: string | null;
  failedStage?: IndexStage | null;
};

export type DocumentRecord = {
  id: string;
  datasetId: string;
  name: string;
  sourceType: string;
  status: string;
  error: string | null;
  extractedText: string | null;
  cleanedText: string | null;
  charCountBefore: number | null;
  charCountAfter: number | null;
  failedStage: string | null;
  sourceBytes: Uint8Array | null;
  splitChunks: SplitPreviewChunk[] | null;
  embeddedChunks: EmbeddedChunkRecord[] | null;
  createdAt: Date;
};

export type EmbeddedChunkRecord = SplitPreviewChunk & { embedding: number[] };

const parseChunkConfig = (value: unknown): ChunkConfig => {
  const parsed = ChunkConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_CHUNK_CONFIG;
};

const toDocumentDto = (record: DocumentRecord): KnowledgeDocument =>
  KnowledgeDocumentSchema.parse({
    id: record.id,
    datasetId: record.datasetId,
    name: record.name,
    sourceType: record.sourceType,
    status: record.status,
    error: record.error,
    charCountBefore: record.charCountBefore,
    charCountAfter: record.charCountAfter,
    failedStage: record.failedStage,
    createdAt: record.createdAt.toISOString(),
  });

export interface KnowledgeRepository {
  createDataset(
    ownerId: string,
    name: string,
    embeddingModel: string,
    chunkConfig: ChunkConfig,
  ): Promise<Dataset>;
  listDatasets(ownerId: string): Promise<Dataset[]>;
  getDataset(ownerId: string, id: string): Promise<Dataset | null>;
  /** 仅供索引任务等没有请求主体的系统流程使用。 */
  getDatasetForSystem(id: string): Promise<Dataset | null>;
  deleteDataset(ownerId: string, id: string): Promise<boolean>;
  createDocument(input: NewDocumentInput): Promise<KnowledgeDocument>;
  listDocuments(datasetId: string): Promise<KnowledgeDocument[]>;
  getDocument(ownerId: string, id: string): Promise<DocumentRecord | null>;
  /** 仅供索引任务等没有请求主体的系统流程使用。 */
  getDocumentForSystem(id: string): Promise<DocumentRecord | null>;
  updateDocument(id: string, patch: Partial<DocumentRecord>): Promise<void>;
  deleteDocument(id: string): Promise<void>;
  listPendingDocumentIds(): Promise<string[]>;
  countChunks(documentId: string): Promise<number>;
}

export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  private readonly datasetRows: Array<{
    id: string;
    name: string;
    embeddingModel: string;
    chunkConfig: ChunkConfig;
    createdAt: Date;
  }> = [];
  private readonly documentRows: DocumentRecord[] = [];
  private readonly owners = new Map<string, string>();

  async createDataset(
    ownerId: string,
    name: string,
    embeddingModel: string,
    chunkConfig: ChunkConfig,
  ): Promise<Dataset> {
    await Promise.resolve();
    const row = {
      id: randomUUID(),
      name,
      embeddingModel,
      chunkConfig,
      createdAt: new Date(),
    };
    this.datasetRows.push(row);
    this.owners.set(row.id, ownerId);
    return DatasetSchema.parse({
      ...row,
      documentCount: 0,
      chunkCount: 0,
      createdAt: row.createdAt.toISOString(),
    });
  }

  async listDatasets(ownerId: string): Promise<Dataset[]> {
    await Promise.resolve();
    return this.datasetRows
      .filter((row) => this.owners.get(row.id) === ownerId)
      .map((row) => this.toDataset(row));
  }

  async getDataset(ownerId: string, id: string): Promise<Dataset | null> {
    if (this.owners.get(id) !== ownerId) return null;
    return this.getDatasetForSystem(id);
  }

  async getDatasetForSystem(id: string): Promise<Dataset | null> {
    await Promise.resolve();
    const row = this.datasetRows.find((item) => item.id === id);
    return row ? this.toDataset(row) : null;
  }

  async deleteDataset(ownerId: string, id: string): Promise<boolean> {
    if (this.owners.get(id) !== ownerId) return false;
    const documentsToDelete = this.documentRows.filter((row) => row.datasetId === id);
    for (const document of documentsToDelete) {
      await this.deleteDocument(document.id);
    }
    const index = this.datasetRows.findIndex((row) => row.id === id);
    if (index < 0) return false;
    this.datasetRows.splice(index, 1);
    this.owners.delete(id);
    return true;
  }

  async createDocument(input: NewDocumentInput): Promise<KnowledgeDocument> {
    await Promise.resolve();
    const record: DocumentRecord = {
      id: randomUUID(),
      datasetId: input.datasetId,
      name: input.name,
      sourceType: input.sourceType,
      status: input.status ?? 'pending',
      error: input.error ?? null,
      extractedText: input.extractedText ?? null,
      cleanedText: null,
      charCountBefore: null,
      charCountAfter: null,
      failedStage: input.failedStage ?? null,
      sourceBytes: input.sourceBytes ? new Uint8Array(input.sourceBytes) : null,
      splitChunks: null,
      embeddedChunks: null,
      createdAt: new Date(),
    };
    this.documentRows.push(record);
    return toDocumentDto(record);
  }

  async listDocuments(datasetId: string): Promise<KnowledgeDocument[]> {
    await Promise.resolve();
    return this.documentRows.filter((row) => row.datasetId === datasetId).map(toDocumentDto);
  }

  async getDocument(ownerId: string, id: string): Promise<DocumentRecord | null> {
    const record = await this.getDocumentForSystem(id);
    return record && this.owners.get(record.datasetId) === ownerId ? record : null;
  }

  async getDocumentForSystem(id: string): Promise<DocumentRecord | null> {
    await Promise.resolve();
    return this.documentRows.find((row) => row.id === id) ?? null;
  }

  async updateDocument(id: string, patch: Partial<DocumentRecord>): Promise<void> {
    await Promise.resolve();
    const record = this.documentRows.find((row) => row.id === id);
    if (!record) return;
    Object.assign(record, patch);
  }

  async deleteDocument(id: string): Promise<void> {
    await Promise.resolve();
    const index = this.documentRows.findIndex((row) => row.id === id);
    if (index >= 0) this.documentRows.splice(index, 1);
  }

  async listPendingDocumentIds(): Promise<string[]> {
    await Promise.resolve();
    return this.documentRows
      .filter((row) => row.status !== 'completed' && row.status !== 'failed')
      .map((row) => row.id);
  }

  async countChunks(_documentId: string): Promise<number> {
    await Promise.resolve();
    return 0;
  }

  private toDataset(row: {
    id: string;
    name: string;
    embeddingModel: string;
    chunkConfig: ChunkConfig;
    createdAt: Date;
  }): Dataset {
    const documentCount = this.documentRows.filter((item) => item.datasetId === row.id).length;
    return DatasetSchema.parse({
      id: row.id,
      name: row.name,
      embeddingModel: row.embeddingModel,
      chunkConfig: row.chunkConfig,
      documentCount,
      chunkCount: 0,
      createdAt: row.createdAt.toISOString(),
    });
  }
}

const ownedDataset = (ownerId: string, id: string) =>
  and(eq(datasets.id, id), eq(datasets.ownerId, ownerId));

export class DrizzleKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly db: AppDatabase) {}

  async createDataset(
    ownerId: string,
    name: string,
    embeddingModel: string,
    chunkConfig: ChunkConfig,
  ): Promise<Dataset> {
    const [row] = await this.db
      .insert(datasets)
      .values({ ownerId, name, embeddingModel, chunkConfig })
      .returning();
    if (!row) throw new Error('无法创建知识库');
    return DatasetSchema.parse({
      id: row.id,
      name: row.name,
      embeddingModel: row.embeddingModel,
      chunkConfig: parseChunkConfig(row.chunkConfig),
      documentCount: 0,
      chunkCount: 0,
      createdAt: row.createdAt.toISOString(),
    });
  }

  async listDatasets(ownerId: string): Promise<Dataset[]> {
    const rows = await this.db.select().from(datasets).where(eq(datasets.ownerId, ownerId));
    const result: Dataset[] = [];
    for (const row of rows) {
      result.push(await this.toDataset(row));
    }
    return result;
  }

  async getDataset(ownerId: string, id: string): Promise<Dataset | null> {
    const [row] = await this.db.select().from(datasets).where(ownedDataset(ownerId, id)).limit(1);
    return row ? this.toDataset(row) : null;
  }

  async getDatasetForSystem(id: string): Promise<Dataset | null> {
    const [row] = await this.db.select().from(datasets).where(eq(datasets.id, id)).limit(1);
    return row ? this.toDataset(row) : null;
  }

  async deleteDataset(ownerId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(datasets)
      .where(ownedDataset(ownerId, id))
      .returning({ id: datasets.id });
    return rows.length > 0;
  }

  async createDocument(input: NewDocumentInput): Promise<KnowledgeDocument> {
    const [row] = await this.db
      .insert(documents)
      .values({
        datasetId: input.datasetId,
        name: input.name,
        sourceType: input.sourceType,
        status: input.status ?? 'pending',
        error: input.error ?? null,
        extractedText: input.extractedText ?? null,
        failedStage: input.failedStage ?? null,
        sourceBytes: input.sourceBytes ? Buffer.from(input.sourceBytes) : null,
        splitChunks: null,
        embeddedChunks: null,
      })
      .returning();
    if (!row) throw new Error('无法创建文档');
    return toDocumentDto(this.fromRow(row));
  }

  async listDocuments(datasetId: string): Promise<KnowledgeDocument[]> {
    const rows = await this.db.select().from(documents).where(eq(documents.datasetId, datasetId));
    return rows.map((row) => toDocumentDto(this.fromRow(row)));
  }

  async getDocument(ownerId: string, id: string): Promise<DocumentRecord | null> {
    const [row] = await this.db
      .select({ document: documents })
      .from(documents)
      .innerJoin(datasets, eq(datasets.id, documents.datasetId))
      .where(and(eq(documents.id, id), eq(datasets.ownerId, ownerId)))
      .limit(1);
    return row ? this.fromRow(row.document) : null;
  }

  async getDocumentForSystem(id: string): Promise<DocumentRecord | null> {
    const [row] = await this.db.select().from(documents).where(eq(documents.id, id)).limit(1);
    return row ? this.fromRow(row) : null;
  }

  async updateDocument(id: string, patch: Partial<DocumentRecord>): Promise<void> {
    const values: Partial<typeof documents.$inferInsert> = {};
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.error !== undefined) values.error = patch.error;
    if (patch.extractedText !== undefined) values.extractedText = patch.extractedText;
    if (patch.cleanedText !== undefined) values.cleanedText = patch.cleanedText;
    if (patch.charCountBefore !== undefined) values.charCountBefore = patch.charCountBefore;
    if (patch.charCountAfter !== undefined) values.charCountAfter = patch.charCountAfter;
    if (patch.failedStage !== undefined) values.failedStage = patch.failedStage;
    if (patch.sourceBytes !== undefined) {
      values.sourceBytes = patch.sourceBytes ? Buffer.from(patch.sourceBytes) : null;
    }
    if (patch.splitChunks !== undefined) values.splitChunks = patch.splitChunks;
    if (patch.embeddedChunks !== undefined) values.embeddedChunks = patch.embeddedChunks;
    if (Object.keys(values).length === 0) return;
    await this.db.update(documents).set(values).where(eq(documents.id, id));
  }

  async deleteDocument(id: string): Promise<void> {
    await this.db.delete(documents).where(eq(documents.id, id));
  }

  async listPendingDocumentIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: documents.id })
      .from(documents)
      .where(
        inArray(documents.status, [
          'pending',
          'extracting',
          'cleaning',
          'splitting',
          'embedding',
          'indexing',
        ]),
      );
    return rows.map((row) => row.id);
  }

  async countChunks(documentId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(chunks)
      .where(eq(chunks.documentId, documentId));
    return Number(row?.value ?? 0);
  }

  private fromRow(row: typeof documents.$inferSelect): DocumentRecord {
    return {
      id: row.id,
      datasetId: row.datasetId,
      name: row.name,
      sourceType: row.sourceType,
      status: row.status,
      error: row.error ?? null,
      extractedText: row.extractedText ?? null,
      cleanedText: row.cleanedText ?? null,
      charCountBefore: row.charCountBefore ?? null,
      charCountAfter: row.charCountAfter ?? null,
      failedStage: row.failedStage ?? null,
      sourceBytes: row.sourceBytes ? new Uint8Array(row.sourceBytes) : null,
      splitChunks: Array.isArray(row.splitChunks) ? (row.splitChunks as SplitPreviewChunk[]) : null,
      embeddedChunks: Array.isArray(row.embeddedChunks)
        ? (row.embeddedChunks as EmbeddedChunkRecord[])
        : null,
      createdAt: row.createdAt,
    };
  }

  private async toDataset(row: typeof datasets.$inferSelect): Promise<Dataset> {
    const documentRows = await this.db
      .select({ value: count() })
      .from(documents)
      .where(eq(documents.datasetId, row.id));
    const chunkRows = await this.db
      .select({ value: count() })
      .from(chunks)
      .innerJoin(documents, eq(chunks.documentId, documents.id))
      .where(eq(documents.datasetId, row.id));
    return DatasetSchema.parse({
      id: row.id,
      name: row.name,
      embeddingModel: row.embeddingModel,
      chunkConfig: parseChunkConfig(row.chunkConfig),
      documentCount: Number(documentRows[0]?.value ?? 0),
      chunkCount: Number(chunkRows[0]?.value ?? 0),
      createdAt: row.createdAt.toISOString(),
    });
  }
}

export const createKnowledgeRepository = (
  db: AppDatabase | null,
  nodeEnv: string,
): KnowledgeRepository => {
  if (db) return new DrizzleKnowledgeRepository(db);
  if (nodeEnv === 'production') {
    throw new Error('生产环境知识库必须连接 PostgreSQL');
  }
  return new InMemoryKnowledgeRepository();
};
