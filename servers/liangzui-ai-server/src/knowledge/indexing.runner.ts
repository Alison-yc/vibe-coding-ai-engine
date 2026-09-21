import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ChunkConfigSchema, DEFAULT_CHUNK_CONFIG, type ChunkConfig } from '@ai-engine/contracts';
import { VECTOR_STORE, type VectorStore } from '../database/vector-store';
import { LLM_GATEWAY, type LlmGateway } from '../llm/llm-gateway';
import { cleanDocumentText } from './pipeline/clean';
import { EmptyPdfTextError, extractDocumentText } from './pipeline/extract';
import { splitDocumentText } from './pipeline/split';
import {
  KNOWLEDGE_REPOSITORY,
  type DocumentRecord,
  type EmbeddedChunkRecord,
  type KnowledgeRepository,
} from './knowledge.repository';

export type IndexingSource = {
  filename?: string;
  bytes?: Uint8Array;
};

const hashContent = (text: string): string => createHash('sha256').update(text).digest('hex');

@Injectable()
export class IndexingRunner {
  private readonly embeddingCache = new Map<string, number[]>();
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(
    @Inject(KNOWLEDGE_REPOSITORY) private readonly repository: KnowledgeRepository,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
    @Inject(LLM_GATEWAY) private readonly gateway: LlmGateway,
  ) {}

  async run(documentId: string, source: IndexingSource = {}, batchSize = 32): Promise<void> {
    const existing = this.inflight.get(documentId);
    if (existing) return existing;
    const job = this.execute(documentId, source, batchSize).finally(() => {
      this.inflight.delete(documentId);
    });
    this.inflight.set(documentId, job);
    return job;
  }

  private async execute(
    documentId: string,
    source: IndexingSource,
    batchSize: number,
  ): Promise<void> {
    let activeStage: DocumentRecord['failedStage'] = 'extract';
    try {
      const document = await this.repository.getDocument(documentId);
      if (!document) return;
      const dataset = await this.repository.getDataset(document.datasetId);
      const chunkConfig = dataset?.chunkConfig ?? DEFAULT_CHUNK_CONFIG;
      await this.extractAndClean(document, source, (stage) => {
        activeStage = stage;
      });
      const refreshed = await this.repository.getDocument(documentId);
      if (!refreshed?.cleanedText) return;
      await this.splitEmbedIndex(refreshed, chunkConfig, batchSize, (stage) => {
        activeStage = stage;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '索引失败';
      await this.repository.updateDocument(documentId, {
        status: 'failed',
        error: message,
        failedStage: error instanceof EmptyPdfTextError ? 'extract' : activeStage,
      });
    }
  }

  private async extractAndClean(
    document: DocumentRecord,
    source: IndexingSource,
    setStage: (stage: DocumentRecord['failedStage']) => void,
  ): Promise<void> {
    if (document.cleanedText) return;
    setStage('extract');
    await this.repository.updateDocument(document.id, { status: 'extracting', error: null });
    let extracted = document.extractedText;
    if (!extracted) {
      const bytes = source.bytes ?? document.sourceBytes ?? undefined;
      const filename = source.filename ?? document.name;
      if (!bytes) {
        throw new Error('文档没有可索引的文本，请重新上传。');
      }
      extracted = await extractDocumentText(filename, bytes);
      await this.repository.updateDocument(document.id, { extractedText: extracted });
    }
    setStage('clean');
    await this.repository.updateDocument(document.id, { status: 'cleaning' });
    const cleaned = cleanDocumentText(extracted);
    if (cleaned.text.length === 0) {
      throw new Error('文档清洗后没有可索引文本。');
    }
    await this.repository.updateDocument(document.id, {
      extractedText: extracted,
      cleanedText: cleaned.text,
      charCountBefore: cleaned.charCountBefore,
      charCountAfter: cleaned.charCountAfter,
    });
  }

  private async splitEmbedIndex(
    document: DocumentRecord,
    chunkConfig: ChunkConfig,
    batchSize: number,
    setStage: (stage: DocumentRecord['failedStage']) => void,
  ): Promise<void> {
    setStage('split');
    const config = ChunkConfigSchema.parse(chunkConfig);
    let pieces = document.splitChunks;
    if (!pieces) {
      await this.repository.updateDocument(document.id, { status: 'splitting' });
      pieces = splitDocumentText(document.cleanedText ?? '', config);
      await this.repository.updateDocument(document.id, { splitChunks: pieces });
    }
    let embeddedChunks = document.embeddedChunks;
    if (!embeddedChunks) {
      setStage('embed');
      await this.repository.updateDocument(document.id, { status: 'embedding' });
      embeddedChunks = await this.embedPieces(pieces, batchSize);
      await this.repository.updateDocument(document.id, { embeddedChunks });
    }
    setStage('index');
    await this.repository.updateDocument(document.id, { status: 'indexing' });
    await this.vectorStore.replaceDocumentChunks(
      document.id,
      embeddedChunks.map((piece) => ({
        documentId: document.id,
        documentName: document.name,
        datasetId: document.datasetId,
        content: piece.content,
        embedding: piece.embedding,
        metadata: piece.headingPath ? { headingPath: piece.headingPath } : {},
        position: piece.position,
      })),
    );
    await this.repository.updateDocument(document.id, {
      status: 'completed',
      error: null,
      failedStage: null,
      splitChunks: null,
      embeddedChunks: null,
    });
  }

  private async embedPieces(
    pieces: Array<{ content: string; position: number; headingPath?: string }>,
    batchSize: number,
  ): Promise<EmbeddedChunkRecord[]> {
    const embeddings: number[][] = [];
    for (let index = 0; index < pieces.length; index += batchSize) {
      const batch = pieces.slice(index, index + batchSize);
      const pending: string[] = [];
      const pendingIndexes: number[] = [];
      const batchVectors: Array<number[] | undefined> = batch.map((piece) => {
        const cached = this.embeddingCache.get(hashContent(piece.content));
        return cached ? [...cached] : undefined;
      });
      batch.forEach((piece, offset) => {
        if (!batchVectors[offset]) {
          pending.push(piece.content);
          pendingIndexes.push(offset);
        }
      });
      if (pending.length > 0) {
        const fresh = await this.gateway.embed(pending);
        pendingIndexes.forEach((offset, freshIndex) => {
          const vector = fresh[freshIndex];
          const text = pending[freshIndex];
          if (!vector || !text) throw new Error('Embedding 批次结果不完整');
          this.embeddingCache.set(hashContent(text), [...vector]);
          batchVectors[offset] = [...vector];
        });
      }
      embeddings.push(
        ...batchVectors.map((vector) => {
          if (!vector) throw new Error('Embedding 缺失');
          return vector;
        }),
      );
    }

    return pieces.map((piece, index) => ({
      ...piece,
      embedding: embeddings[index] ?? [],
    }));
  }
}
