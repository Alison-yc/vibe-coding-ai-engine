import { z } from 'zod';
import { ModelIdSchema } from '../llm/model.js';

export const LlmOperationSchema = z.enum(['chat', 'stream', 'embed']);
export type LlmOperation = z.infer<typeof LlmOperationSchema>;

export const LlmCallMetricSchema = z.object({
  id: z.string().uuid(),
  traceId: z.string().uuid(),
  operation: LlmOperationSchema,
  model: ModelIdSchema,
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  contextLimitTokens: z.number().int().positive(),
  firstTokenMs: z.number().int().nonnegative().nullable(),
  totalMs: z.number().int().nonnegative(),
  tokensPerSecond: z.number().nonnegative().nullable(),
  finishReason: z.string().nullable(),
  toolCallCount: z.number().int().nonnegative(),
  toolCallValid: z.number().int().nonnegative(),
  recordedAt: z.string().datetime(),
});
export type LlmCallMetric = z.infer<typeof LlmCallMetricSchema>;

export const ObservabilitySummarySchema = z.object({
  totalCalls: z.number().int().nonnegative(),
  finishReasonCounts: z.record(z.string(), z.number().int().nonnegative()),
  contextUsageBuckets: z.object({
    low: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
  }),
  averageTotalMs: z.number().nonnegative(),
  operationAverageMs: z.record(z.string(), z.number().nonnegative()),
});
export type ObservabilitySummary = z.infer<typeof ObservabilitySummarySchema>;

export const ObservabilityMetricsResponseSchema = z.object({
  calls: z.array(LlmCallMetricSchema),
  summary: ObservabilitySummarySchema,
});
export type ObservabilityMetricsResponse = z.infer<typeof ObservabilityMetricsResponseSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  chatModel: z.string().min(1),
  embeddingModel: z.string().min(1),
  numCtx: z.number().int().positive(),
  numPredict: z.number().int().positive(),
  temperature: z.number().min(0).max(2),
  vectorStore: z.enum(['postgres', 'memory']),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
