import {
  VariableAssignerNodeConfigSchema,
  type NodeRunResult,
  type ValueSelector,
  type VariableAssignerNodeConfig,
} from '@ai-engine/contracts';
import type { NodeRunner, VariablePoolReader } from '../engine/types';
import { templateSelectors } from './template-selectors';

export class VariableAssignerNodeRunner implements NodeRunner<VariableAssignerNodeConfig> {
  readonly type = 'variable-assigner' as const;
  readonly configSchema = VariableAssignerNodeConfigSchema;

  getValueSelectors(config: VariableAssignerNodeConfig): ValueSelector[] {
    return config.assignments.flatMap((assignment) => {
      if (assignment.value.source === 'selector') return [assignment.value.selector];
      if (assignment.value.source === 'template') {
        return templateSelectors(assignment.value.template);
      }
      return [];
    });
  }

  async run(config: VariableAssignerNodeConfig, pool: VariablePoolReader): Promise<NodeRunResult> {
    await Promise.resolve();
    const outputs: Record<string, unknown> = {};
    for (const assignment of config.assignments) {
      const value = assignment.value;
      if (value.source === 'constant') outputs[assignment.name] = value.value;
      if (value.source === 'template') outputs[assignment.name] = pool.render(value.template);
      if (value.source === 'selector') {
        const selected = pool.get(value.selector);
        if (selected === undefined) {
          throw new Error(`赋值变量 ${assignment.name} 的来源不存在`);
        }
        outputs[assignment.name] = selected;
      }
    }
    return { outputs };
  }
}
