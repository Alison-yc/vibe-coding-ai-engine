import {
  EndNodeConfigSchema,
  type EndNodeConfig,
  type NodeRunResult,
  type ValueSelector,
} from '@ai-engine/contracts';
import type { NodeRunner, VariablePoolReader } from '../engine/types';

export class EndNodeRunner implements NodeRunner<EndNodeConfig> {
  readonly type = 'end' as const;
  readonly role = 'terminal' as const;
  readonly configSchema = EndNodeConfigSchema;

  getValueSelectors(config: EndNodeConfig): ValueSelector[] {
    return config.outputs.flatMap((output) => [
      output.selector,
      ...(output.fallbackSelectors ?? []),
    ]);
  }

  async run(config: EndNodeConfig, pool: VariablePoolReader): Promise<NodeRunResult> {
    await Promise.resolve();
    const outputs: Record<string, unknown> = {};
    for (const output of config.outputs) {
      const selectors = [output.selector, ...(output.fallbackSelectors ?? [])];
      const value = selectors
        .map((selector) => pool.get(selector))
        .find((item) => item !== undefined);
      if (value === undefined) throw new Error(`结束节点输出 ${output.name} 的变量不存在`);
      outputs[output.name] = value;
    }
    return { outputs };
  }
}
