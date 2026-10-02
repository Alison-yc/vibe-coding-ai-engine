import { VariableAssignerNodeConfigSchema } from '@ai-engine/contracts';
import { useTranslation } from 'react-i18next';
import { NodeSummary } from '../common';
import type { NodeBodyProps } from '../types';

export const VariableAssignerNodeBody = ({ data }: NodeBodyProps) => {
  const { t } = useTranslation('workflow');
  const config = VariableAssignerNodeConfigSchema.safeParse(data.config);
  return (
    <NodeSummary data={data}>
      {config.success
        ? t('nodes.summary.variables', { count: config.data.assignments.length })
        : t('nodes.summary.incomplete')}
    </NodeSummary>
  );
};
