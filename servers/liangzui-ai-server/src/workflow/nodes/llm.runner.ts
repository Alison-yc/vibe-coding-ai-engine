import {
  LlmNodeConfigSchema,
  type LlmNodeConfig,
  type NodeRunResult,
  type ValueSelector,
} from '@ai-engine/contracts';
import type { LlmGateway } from '../../llm/llm-gateway';
import type { NodeRunContext, NodeRunner, VariablePoolReader } from '../engine/types';
import { templateSelectors } from './template-selectors';

export class LlmNodeRunner implements NodeRunner<LlmNodeConfig> {
  readonly type = 'llm' as const;
  readonly configSchema = LlmNodeConfigSchema;

  constructor(private readonly gateway: LlmGateway) {}

  getValueSelectors(config: LlmNodeConfig): ValueSelector[] {
    return [...templateSelectors(config.prompt), ...templateSelectors(config.systemPrompt ?? '')];
  }

  async run(
    config: LlmNodeConfig,
    pool: VariablePoolReader,
    context: NodeRunContext,
  ): Promise<NodeRunResult> {
    const prompt = pool.render(config.prompt);
    const systemPrompt = config.systemPrompt ? pool.render(config.systemPrompt) : undefined;
    let text = '';
    for await (const event of this.gateway.stream(
      {
        sessionId: context.runId,
        content: prompt,
        messages: systemPrompt
          ? [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ]
          : undefined,
        numPredict: config.numPredict,
      },
      context.signal,
    )) {
      if (event.event === 'error') throw new Error(event.data.message);
      if (event.event !== 'chunk') continue;
      text += event.data.text;
      context.emit(event.data.text);
    }
    if (!text) throw new Error('LLM 节点没有生成文本');
    return { outputs: { text } };
  }
}
