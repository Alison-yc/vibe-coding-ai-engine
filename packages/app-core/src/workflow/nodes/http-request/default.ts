import { HttpRequestNodeConfigSchema } from '@ai-engine/contracts';

export const httpRequestDefaultConfig = {
  method: 'GET',
  url: 'https://example.com',
  headers: {},
};

export const httpRequestOutputVars = () => [
  { name: 'status', type: 'number' as const },
  { name: 'headers', type: 'object' as const },
  { name: 'body', type: 'string' as const },
];

export const validateHttpRequestConfig = (config: Record<string, unknown>): string[] => {
  const result = HttpRequestNodeConfigSchema.safeParse(config);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};
