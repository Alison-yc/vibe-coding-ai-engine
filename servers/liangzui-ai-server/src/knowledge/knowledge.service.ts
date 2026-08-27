import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_CHUNK_CONFIG,
  KNOWLEDGE_EMPTY_ANSWER,
  KnowledgeAnswerResponseSchema,
  KnowledgeDocumentSchema,
  RetrieveResponseSchema,
  SplitPreviewResponseSchema,
  type CreateDatasetRequest,
  type CreatePasteDocumentRequest,
  type Dataset,
  type KnowledgeAnswerRequest,
  type KnowledgeAnswerResponse,
  type KnowledgeDocument,
  type RetrieveRequest,
  type RetrieveResponse,
  type SplitPreviewRequest,
  type SplitPreviewResponse,
} from '@ai-engine/contracts';
import type { AppConfig } from '../config/ollama.config';
import { VECTOR_STORE, type VectorStore } from '../database/vector-store';
import { LLM_GATEWAY, type LlmGateway } from '../llm/llm-gateway';
import { IndexingRunner } from './indexing.runner';
import { KNOWLEDGE_REPOSITORY, type KnowledgeRepository } from './knowledge.repository';
import { safeDocumentName } from './pipeline/extract';
import { assembleRagPrompt } from './pipeline/prompt';
import {
  applyContextBudget,
  applyScoreThreshold,
  rerankHits,
  toRetrieveHits,
} from './pipeline/retrieve';
import { splitDocumentText } from './pipeline/split';

const PROMPT_RESERVE_TOKENS = 800;

@Injectable()
export class KnowledgeService {
  constructor(
    @Inject(KNOWLEDGE_REPOSITORY) private readonly repository: KnowledgeRepository,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
    @Inject(LLM_GATEWAY) private readonly gateway: LlmGateway,
    @Inject(IndexingRunner) private readonly indexing: IndexingRunner,
    @Inject(ConfigService) private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async createDataset(request: CreateDatasetRequest): Promise<Dataset> {
    return this.repository.createDataset(
      request.name,
      this.config.get('OLLAMA_EMBED_MODEL', { infer: true }),
      request.chunkConfig ?? DEFAULT_CHUNK_CONFIG,
    );
  }

  listDatasets(): Promise<Dataset[]> {
    return this.repository.listDatasets();
  }

  async getDataset(id: string): Promise<Dataset> {
    const dataset = await this.repository.getDataset(id);
    if (!dataset) throw new Error('NOT_FOUND:知识库不存在');
    return dataset;
  }

  async deleteDataset(id: string): Promise<void> {
    await this.getDataset(id);
    const documents = await this.repository.listDocuments(id);
    for (const document of documents) {
      await this.vectorStore.deleteByDocumentId(document.id);
    }
    await this.repository.deleteDataset(id);
  }

  async createPasteDocument(
    datasetId: string,
    request: CreatePasteDocumentRequest,
  ): Promise<KnowledgeDocument> {
    await this.getDataset(datasetId);
    const document = await this.repository.createDocument({
      datasetId,
      name: request.name,
      sourceType: 'paste',
      extractedText: request.text,
    });
    void this.indexing.run(document.id, {}, this.embedBatchSize());
    return document;
  }

  async createUploadDocument(
    datasetId: string,
    filename: string,
    bytes: Uint8Array,
  ): Promise<KnowledgeDocument> {
    await this.getDataset(datasetId);
    const name = safeDocumentName(filename);
    const document = await this.repository.createDocument({
      datasetId,
      name,
      sourceType: 'upload',
      sourceBytes: bytes,
    });
    void this.indexing.run(document.id, {}, this.embedBatchSize());
    return KnowledgeDocumentSchema.parse(document);
  }

  listDocuments(datasetId: string): Promise<KnowledgeDocument[]> {
    return this.repository.listDocuments(datasetId);
  }

  async getDocument(id: string): Promise<KnowledgeDocument> {
    const record = await this.repository.getDocument(id);
    if (!record) throw new Error('NOT_FOUND:文档不存在');
    return KnowledgeDocumentSchema.parse({
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
  }

  async deleteDocument(id: string): Promise<void> {
    const record = await this.repository.getDocument(id);
    if (!record) throw new Error('NOT_FOUND:文档不存在');
    await this.vectorStore.deleteByDocumentId(id);
    await this.repository.deleteDocument(id);
  }

  async reindex(id: string): Promise<KnowledgeDocument> {
    const record = await this.repository.getDocument(id);
    if (!record) throw new Error('NOT_FOUND:文档不存在');
    await this.repository.updateDocument(id, {
      status: 'pending',
      error: null,
      ...(record.status === 'completed'
        ? {
            failedStage: null,
            cleanedText: null,
            splitChunks: null,
            embeddedChunks: null,
          }
        : {}),
    });
    void this.indexing.run(id, {}, this.embedBatchSize());
    return this.getDocument(id);
  }

  previewSplit(request: SplitPreviewRequest): SplitPreviewResponse {
    const chunks = splitDocumentText(request.text, request.chunkConfig ?? DEFAULT_CHUNK_CONFIG);
    return SplitPreviewResponseSchema.parse({ chunks });
  }

  async retrieve(datasetId: string, request: RetrieveRequest): Promise<RetrieveResponse> {
    await this.getDataset(datasetId);
    const queryVectors = await this.gateway.embed([request.query]);
    const queryVector = queryVectors[0];
    if (!queryVector) throw new Error('查询向量为空');
    const raw = await this.vectorStore.similaritySearch(queryVector, request.topK, datasetId);
    const filtered = applyScoreThreshold(raw, request.scoreThreshold);
    const ranked = rerankHits(request.query, filtered);
    const budget = this.config.get('OLLAMA_NUM_CTX', { infer: true }) - PROMPT_RESERVE_TOKENS;
    const hits = toRetrieveHits(applyContextBudget(ranked, Math.max(budget, 1)));
    return RetrieveResponseSchema.parse({ hits });
  }

  async answer(
    datasetId: string,
    request: KnowledgeAnswerRequest,
  ): Promise<KnowledgeAnswerResponse> {
    const retrieved = await this.retrieve(datasetId, request);
    if (retrieved.hits.length === 0) {
      return KnowledgeAnswerResponseSchema.parse({
        answer: KNOWLEDGE_EMPTY_ANSWER,
        citations: [],
      });
    }
    const prompt = assembleRagPrompt(request.query, retrieved.hits);
    const response = await this.gateway.chat({
      sessionId: randomUUID(),
      content: prompt,
    });
    const textPart = response.message.parts.find((part) => part.type === 'text');
    if (!textPart || textPart.type !== 'text') throw new Error('模型响应没有文本部分');
    return KnowledgeAnswerResponseSchema.parse({
      answer: textPart.text,
      citations: retrieved.hits,
    });
  }

  private embedBatchSize(): number {
    return this.config.get('OLLAMA_EMBED_BATCH_SIZE', { infer: true });
  }
}
