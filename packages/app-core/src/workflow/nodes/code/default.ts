import { CodeNodeConfigSchema } from '@ai-engine/contracts';

export const codeDefaultConfig = {
  code: 'return { result: inputs.value };',
  inputs: { value: ['start', 'query'] },
};

export const codeOutputVars = () => [{ name: 'result', type: 'unknown' as const }];

export const validateCodeConfig = (config: Record<string, unknown>): string[] => {
  const result = CodeNodeConfigSchema.safeParse(config);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};
