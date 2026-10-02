import { KnowledgeRetrievalNodeConfigSchema } from '@ai-engine/contracts';

export const knowledgeRetrievalDefaultConfig = {
  datasetId: '',
  query: '{{#start.query#}}',
  topK: 5,
  scoreThreshold: 0.3,
};

export const knowledgeRetrievalOutputVars = () => [{ name: 'chunks', type: 'array' as const }];

export const validateKnowledgeRetrievalConfig = (config: Record<string, unknown>): string[] => {
  const result = KnowledgeRetrievalNodeConfigSchema.safeParse(config);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};
