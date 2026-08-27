import { IfElseNodeConfigSchema } from '@ai-engine/contracts';
import { NodeSummary } from '../common';
import type { NodeBodyProps } from '../types';

export const IfElseNodeBody = ({ data }: NodeBodyProps) => {
  const config = IfElseNodeConfigSchema.safeParse(data.config);
  return (
    <NodeSummary data={data}>
      {config.success ? `${config.data.cases.length + 1} 个分支` : '配置不完整'}
    </NodeSummary>
  );
};
