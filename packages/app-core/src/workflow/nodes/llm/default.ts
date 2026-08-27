import { LlmNodeConfigSchema } from '@ai-engine/contracts';

export const llmDefaultConfig = {
  systemPrompt: '你是一个可靠的中文助手。',
  prompt: '{{#start.query#}}',
};

export const llmOutputVars = () => [{ name: 'text', type: 'string' as const }];

export const validateLlmConfig = (config: Record<string, unknown>): string[] => {
  const result = LlmNodeConfigSchema.safeParse(config);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};
