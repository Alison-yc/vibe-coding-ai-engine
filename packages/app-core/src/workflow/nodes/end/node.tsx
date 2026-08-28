import { EndNodeConfigSchema } from '@ai-engine/contracts';
import { useTranslation } from 'react-i18next';
import { NodeSummary } from '../common';
import type { NodeBodyProps } from '../types';

export const EndNodeBody = ({ data }: NodeBodyProps) => {
  const { t } = useTranslation('workflow');
  const config = EndNodeConfigSchema.safeParse(data.config);
  return (
    <NodeSummary data={data}>
      {config.success
        ? t('nodes.summary.outputFields', { count: config.data.outputs.length })
        : t('nodes.summary.incomplete')}
    </NodeSummary>
  );
};
