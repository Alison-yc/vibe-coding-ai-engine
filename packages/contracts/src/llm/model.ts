import { z } from 'zod';

/** nomic-embed-text 输出维度。数据库迁移与检索必须引用此常量。 */
export const EMBEDDING_DIMENSION = 768;

export const ModelIdSchema = z.string().min(1);
export type ModelId = z.infer<typeof ModelIdSchema>;

export const ModelCapabilitySchema = z.object({
  id: ModelIdSchema,
  supportsTools: z.boolean(),
  supportsVision: z.boolean(),
  supportsJsonMode: z.boolean(),
  needsToolCallFallback: z.boolean(),
  maxToolCount: z.number().int().min(0),
  effectiveContextTokens: z.number().int().positive(),
  sourceReport: z.string().min(1),
  embeddingDimension: z.number().int().positive().optional(),
});
export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

export const GenerationParamsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  numCtx: z.number().int().positive().optional(),
  numPredict: z.number().int().positive().optional(),
});
export type GenerationParams = z.infer<typeof GenerationParamsSchema>;
