import {
  AuthSessionResponseSchema,
  DatasetSchema,
  HealthResponseSchema,
  KnowledgeAnswerResponseSchema,
  KnowledgeDocumentSchema,
  PasswordLoginRequestSchema,
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

export type RagEvalCredentials = {
  identifier: string;
  password: string;
};

export class RagEvalApiClient {
  private token: string | null = null;

  constructor(private readonly baseUrl: string) {}

  /** 知识库接口需要 knowledge:* 权限，访客令牌会被 403，必须用已注册账号登录。 */
  async login(credentials: RagEvalCredentials): Promise<void> {
    const identifier = credentials.identifier.trim();
    const request = PasswordLoginRequestSchema.parse({
      type: identifier.includes('@') ? 'email' : 'phone',
      identifier,
      password: credentials.password,
    });
    const response = await fetch(`${this.baseUrl}/auth/login/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    this.token = AuthSessionResponseSchema.parse(await readJson(response)).token;
  }

  async logout(): Promise<void> {
    if (!this.token) return;
    await fetch(`${this.baseUrl}/auth/logout`, { method: 'POST', headers: this.headers() });
    this.token = null;
  }

  private headers(json = false): Record<string, string> {
    if (!this.token) throw new Error('RAG 评测尚未登录，无法调用知识库接口');
    return {
      Authorization: `Bearer ${this.token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    };
  }

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
      headers: this.headers(true),
      body: JSON.stringify({ name, chunkConfig }),
    });
    return DatasetSchema.parse(await readJson(response));
  }

  async deleteDataset(datasetId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/knowledge/datasets/${datasetId}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new Error(`删除临时评测数据集失败：HTTP ${response.status}`);
    }
  }

  async createDocument(datasetId: string, name: string, text: string): Promise<KnowledgeDocument> {
    const response = await fetch(`${this.baseUrl}/knowledge/datasets/${datasetId}/documents`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ name, text }),
    });
    return KnowledgeDocumentSchema.parse(await readJson(response));
  }

  async getDocument(documentId: string): Promise<KnowledgeDocument> {
    const response = await fetch(`${this.baseUrl}/knowledge/documents/${documentId}`, {
      headers: this.headers(),
    });
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
      headers: this.headers(true),
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
      headers: this.headers(true),
      body: JSON.stringify({ query, topK, scoreThreshold }),
    });
    return KnowledgeAnswerResponseSchema.parse(await readJson(response));
  }
}
