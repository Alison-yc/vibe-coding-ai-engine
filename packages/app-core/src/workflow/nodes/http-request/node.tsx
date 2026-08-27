import { HttpRequestNodeConfigSchema } from '@ai-engine/contracts';
import { NodeSummary } from '../common';
import type { NodeBodyProps } from '../types';

export const HttpRequestNodeBody = ({ data }: NodeBodyProps) => {
  const config = HttpRequestNodeConfigSchema.safeParse(data.config);
  return (
    <NodeSummary data={data}>
      {config.success ? `${config.data.method} ${config.data.url}` : '配置请求'}
    </NodeSummary>
  );
};
