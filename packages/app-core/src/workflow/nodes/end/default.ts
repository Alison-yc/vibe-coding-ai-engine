import { EndNodeConfigSchema } from '@ai-engine/contracts';

export const endDefaultConfig = {
  outputs: [{ name: 'result', selector: ['start', 'query'] }],
};

export const endOutputVars = () => [];

export const validateEndConfig = (config: Record<string, unknown>): string[] => {
  const result = EndNodeConfigSchema.safeParse(config);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};
