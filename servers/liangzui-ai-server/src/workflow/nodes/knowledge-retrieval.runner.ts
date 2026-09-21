import {
  KnowledgeRetrievalNodeConfigSchema,
  type KnowledgeRetrievalNodeConfig,
  type NodeRunResult,
  type RetrieveRequest,
  type RetrieveResponse,
  type ValueSelector,
} from '@ai-engine/contracts';
import type { NodeRunContext, NodeRunner, VariablePoolReader } from '../engine/types';
import { templateSelectors } from './template-selectors';

export interface KnowledgeRetriever {
  retrieve(datasetId: string, request: RetrieveRequest): Promise<RetrieveResponse>;
}

export class KnowledgeRetrievalNodeRunner implements NodeRunner<KnowledgeRetrievalNodeConfig> {
  readonly type = 'knowledge-retrieval' as const;
  readonly configSchema = KnowledgeRetrievalNodeConfigSchema;

  constructor(private readonly knowledge: KnowledgeRetriever) {}

  getValueSelectors(config: KnowledgeRetrievalNodeConfig): ValueSelector[] {
    return templateSelectors(config.query);
  }

  async run(
    config: KnowledgeRetrievalNodeConfig,
    pool: VariablePoolReader,
    context: NodeRunContext,
  ): Promise<NodeRunResult> {
    if (context.signal.aborted) throw context.signal.reason;
    // nosemgrep: javascript.express.security.audit.res-render-injection.res-render-injection -- VariablePool.render 只做内存字符串插值，不调用 Express response.render 或文件系统。
    const query = pool.render(config.query).trim();
    if (!query) throw new Error('知识检索 query 不能为空');
    const result = await this.knowledge.retrieve(config.datasetId, {
      query,
      topK: config.topK,
      scoreThreshold: config.scoreThreshold,
    });
    if (context.signal.aborted) throw context.signal.reason;
    return { outputs: { chunks: result.hits } };
  }
}
