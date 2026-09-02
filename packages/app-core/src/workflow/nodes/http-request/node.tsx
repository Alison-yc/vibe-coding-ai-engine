import { HttpRequestNodeConfigSchema } from '@ai-engine/contracts';
import { useTranslation } from 'react-i18next';
import { NodeSummary } from '../common';
import type { NodeBodyProps } from '../types';

export const HttpRequestNodeBody = ({ data }: NodeBodyProps) => {
  const { t } = useTranslation('workflow');
  const config = HttpRequestNodeConfigSchema.safeParse(data.config);
  return (
    <NodeSummary data={data}>
      {config.success
        ? `${config.data.method} ${config.data.url}`
        : t('nodes.summary.configureRequest')}
    </NodeSummary>
  );
};
