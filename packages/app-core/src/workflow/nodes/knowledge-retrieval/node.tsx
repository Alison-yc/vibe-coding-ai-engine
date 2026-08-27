import { KnowledgeRetrievalNodeConfigSchema } from '@ai-engine/contracts';
import { NodeSummary } from '../common';
import type { NodeBodyProps } from '../types';

export const KnowledgeRetrievalNodeBody = ({ data }: NodeBodyProps) => {
  const config = KnowledgeRetrievalNodeConfigSchema.safeParse(data.config);
  return (
    <NodeSummary data={data}>
      {config.success ? `Top ${config.data.topK}` : '请选择知识库'}
    </NodeSummary>
  );
};
