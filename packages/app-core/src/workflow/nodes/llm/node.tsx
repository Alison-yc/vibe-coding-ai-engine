import { LlmNodeConfigSchema } from '@ai-engine/contracts';
import { useTranslation } from 'react-i18next';
import { NodeSummary } from '../common';
import type { NodeBodyProps } from '../types';

export const LlmNodeBody = ({ data }: NodeBodyProps) => {
  const { t } = useTranslation('workflow');
  const config = LlmNodeConfigSchema.safeParse(data.config);
  const prompt = config.success ? config.data.prompt : '';
  return (
    <NodeSummary data={data}>
      {prompt ? prompt.slice(0, 60) : t('nodes.summary.configurePrompt')}
    </NodeSummary>
  );
};
