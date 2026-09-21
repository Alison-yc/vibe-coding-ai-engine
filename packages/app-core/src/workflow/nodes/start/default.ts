import { StartNodeConfigSchema } from '@ai-engine/contracts';

export const startDefaultConfig = {
  fields: [{ name: 'query', type: 'string', required: true }],
};

export const startOutputVars = (config: Record<string, unknown>) => {
  const parsed = StartNodeConfigSchema.safeParse(config);
  return parsed.success
    ? parsed.data.fields.map((field) => ({ name: field.name, type: field.type }))
    : [];
};

export const validateStartConfig = (config: Record<string, unknown>): string[] => {
  const result = StartNodeConfigSchema.safeParse(config);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};
