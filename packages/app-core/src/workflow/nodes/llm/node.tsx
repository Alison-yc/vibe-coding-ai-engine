import { LlmNodeConfigSchema } from '@ai-engine/contracts';
import { NodeSummary } from '../common';
import type { NodeBodyProps } from '../types';

export const LlmNodeBody = ({ data }: NodeBodyProps) => {
  const config = LlmNodeConfigSchema.safeParse(data.config);
  const prompt = config.success ? config.data.prompt : '';
  return <NodeSummary data={data}>{prompt ? prompt.slice(0, 60) : '配置提示词'}</NodeSummary>;
};
