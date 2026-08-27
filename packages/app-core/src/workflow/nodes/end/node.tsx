import { EndNodeConfigSchema } from '@ai-engine/contracts';
import { NodeSummary } from '../common';
import type { NodeBodyProps } from '../types';

export const EndNodeBody = ({ data }: NodeBodyProps) => {
  const config = EndNodeConfigSchema.safeParse(data.config);
  return (
    <NodeSummary data={data}>
      {config.success ? `${config.data.outputs.length} 个输出字段` : '配置不完整'}
    </NodeSummary>
  );
};
