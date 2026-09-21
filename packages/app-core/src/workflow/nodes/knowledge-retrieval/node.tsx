import { KnowledgeRetrievalNodeConfigSchema } from '@ai-engine/contracts';
import { useTranslation } from 'react-i18next';
import { NodeSummary } from '../common';
import type { NodeBodyProps } from '../types';

export const KnowledgeRetrievalNodeBody = ({ data }: NodeBodyProps) => {
  const { t } = useTranslation('workflow');
  const config = KnowledgeRetrievalNodeConfigSchema.safeParse(data.config);
  return (
    <NodeSummary data={data}>
      {config.success
        ? t('nodes.summary.topK', { count: config.data.topK })
        : t('nodes.summary.selectKnowledgeBase')}
    </NodeSummary>
  );
};
