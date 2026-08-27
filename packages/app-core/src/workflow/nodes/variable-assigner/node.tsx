import { VariableAssignerNodeConfigSchema } from '@ai-engine/contracts';
import { NodeSummary } from '../common';
import type { NodeBodyProps } from '../types';

export const VariableAssignerNodeBody = ({ data }: NodeBodyProps) => {
  const config = VariableAssignerNodeConfigSchema.safeParse(data.config);
  return (
    <NodeSummary data={data}>
      {config.success ? `${config.data.assignments.length} 个变量` : '配置不完整'}
    </NodeSummary>
  );
};
