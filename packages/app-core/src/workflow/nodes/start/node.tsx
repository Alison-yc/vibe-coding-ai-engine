import { StartNodeConfigSchema } from '@ai-engine/contracts';
import { NodeSummary } from '../common';
import type { NodeBodyProps } from '../types';

export const StartNodeBody = ({ data }: NodeBodyProps) => {
  const config = StartNodeConfigSchema.safeParse(data.config);
  return (
    <NodeSummary data={data}>
      {config.success ? `${config.data.fields.length} 个输入字段` : '配置不完整'}
    </NodeSummary>
  );
};
