import { CodeNodeConfigSchema } from '@ai-engine/contracts';
import { NodeSummary } from '../common';
import type { NodeBodyProps } from '../types';

export const CodeNodeBody = ({ data }: NodeBodyProps) => {
  const config = CodeNodeConfigSchema.safeParse(data.config);
  return (
    <NodeSummary data={data}>
      {config.success ? `${config.data.code.split('\n').length} 行 JavaScript` : '配置代码'}
    </NodeSummary>
  );
};
