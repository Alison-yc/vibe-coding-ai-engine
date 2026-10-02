import { CodeNodeConfigSchema } from '@ai-engine/contracts';
import { useTranslation } from 'react-i18next';
import { NodeSummary } from '../common';
import type { NodeBodyProps } from '../types';

export const CodeNodeBody = ({ data }: NodeBodyProps) => {
  const { t } = useTranslation('workflow');
  const config = CodeNodeConfigSchema.safeParse(data.config);
  return (
    <NodeSummary data={data}>
      {config.success
        ? t('nodes.summary.codeLines', { count: config.data.code.split('\n').length })
        : t('nodes.summary.configureCode')}
    </NodeSummary>
  );
};
