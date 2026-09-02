import {
  DatasetSchema,
  HealthResponseSchema,
  KnowledgeAnswerResponseSchema,
  KnowledgeDocumentSchema,
  RetrieveResponseSchema,
  type ChunkConfig,
  type Dataset,
  type HealthResponse,
  type KnowledgeAnswerResponse,
  type KnowledgeDocument,
  type RetrieveResponse,
} from '@ai-engine/contracts';

const readJson = async (response: Response): Promise<unknown> => {
  const body: unknown = await response.json();
  if (!response.ok) {
    const detail =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
        ? body.message
        : `HTTP ${response.status}`;
    throw new Error(`RAG API 请求失败：${detail}`);
  }
  return body;
};

export class RagEvalApiClient {
  constructor(private readonly baseUrl: string) {}

  async assertReady(): Promise<HealthResponse> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`NestJS 服务未就绪：${this.baseUrl}/health 返回 HTTP ${response.status}`);
    }
    return HealthResponseSchema.parse(await response.json());
  }

  async createDataset(name: string, chunkConfig: ChunkConfig): Promise<Dataset> {
    const response = await fetch(`${this.baseUrl}/knowledge/datasets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, chunkConfig }),
    });
    return DatasetSchema.parse(await readJson(response));
  }

  async deleteDataset(datasetId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/knowledge/datasets/${datasetId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`删除临时评测数据集失败：HTTP ${response.status}`);
    }
  }

  async createDocument(datasetId: string, name: string, text: string): Promise<KnowledgeDocument> {
    const response = await fetch(`${this.baseUrl}/knowledge/datasets/${datasetId}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, text }),
    });
    return KnowledgeDocumentSchema.parse(await readJson(response));
  }

  async getDocument(documentId: string): Promise<KnowledgeDocument> {
    const response = await fetch(`${this.baseUrl}/knowledge/documents/${documentId}`);
    return KnowledgeDocumentSchema.parse(await readJson(response));
  }

  async waitForDocument(documentId: string): Promise<void> {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const document = await this.getDocument(documentId);
      if (document.status === 'completed') return;
      if (document.status === 'failed') {
        throw new Error(
          `评测文档索引失败：${document.name} / ${document.failedStage ?? 'unknown'} / ${document.error ?? 'unknown'}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`等待评测文档索引超时：${documentId}`);
  }

  async retrieve(
    datasetId: string,
    query: string,
    topK: number,
    scoreThreshold: number,
  ): Promise<RetrieveResponse> {
    const response = await fetch(`${this.baseUrl}/knowledge/datasets/${datasetId}/retrieve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, topK, scoreThreshold }),
    });
    return RetrieveResponseSchema.parse(await readJson(response));
  }

  async answer(
    datasetId: string,
    query: string,
    topK: number,
    scoreThreshold: number,
  ): Promise<KnowledgeAnswerResponse> {
    const response = await fetch(`${this.baseUrl}/knowledge/datasets/${datasetId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, topK, scoreThreshold }),
    });
    return KnowledgeAnswerResponseSchema.parse(await readJson(response));
  }
}
