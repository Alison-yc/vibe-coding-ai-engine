import {
  CodeNodeConfigSchema,
  type CodeNodeConfig,
  type NodeRunResult,
  type ValueSelector,
} from '@ai-engine/contracts';
import type { NodeRunContext, NodeRunner, VariablePoolReader } from '../engine/types';
import type { QuickJsSandbox } from '../sandbox/quickjs-sandbox';

export class CodeNodeRunner implements NodeRunner<CodeNodeConfig> {
  readonly type = 'code' as const;
  readonly configSchema = CodeNodeConfigSchema;

  constructor(private readonly sandbox: QuickJsSandbox) {}

  getValueSelectors(config: CodeNodeConfig): ValueSelector[] {
    return Object.values(config.inputs);
  }

  async run(
    config: CodeNodeConfig,
    pool: VariablePoolReader,
    context: NodeRunContext,
  ): Promise<NodeRunResult> {
    const inputs: Record<string, unknown> = {};
    for (const [name, selector] of Object.entries(config.inputs)) {
      const value = pool.get(selector);
      if (value === undefined) throw new Error(`Code 节点输入 ${name} 不存在`);
      inputs[name] = value;
    }
    return { outputs: await this.sandbox.execute(config.code, inputs, context.signal) };
  }
}
