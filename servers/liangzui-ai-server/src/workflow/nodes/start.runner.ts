import {
  StartNodeConfigSchema,
  type StartNodeConfig,
  type NodeRunResult,
} from '@ai-engine/contracts';
import type { NodeRunner, VariablePoolReader } from '../engine/types';

const matchesType = (value: unknown, type: StartNodeConfig['fields'][number]['type']): boolean => {
  if (type === 'array') return Array.isArray(value);
  if (type === 'object')
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  return typeof value === type;
};

export class StartNodeRunner implements NodeRunner<StartNodeConfig> {
  readonly type = 'start' as const;
  readonly role = 'entry' as const;
  readonly configSchema = StartNodeConfigSchema;

  async run(config: StartNodeConfig, pool: VariablePoolReader): Promise<NodeRunResult> {
    await Promise.resolve();
    const outputs: Record<string, unknown> = {};
    for (const field of config.fields) {
      const supplied = pool.getSystem(field.name);
      const value = supplied ?? field.defaultValue;
      if (value === undefined) {
        if (field.required) throw new Error(`缺少必填输入：${field.name}`);
        continue;
      }
      if (!matchesType(value, field.type)) {
        throw new Error(`输入 ${field.name} 类型应为 ${field.type}`);
      }
      outputs[field.name] = value;
    }
    return { outputs };
  }
}
