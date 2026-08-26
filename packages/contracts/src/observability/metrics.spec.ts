import { describe, expect, it } from 'vitest';
import {
  HealthResponseSchema,
  LlmCallMetricSchema,
  ObservabilityMetricsResponseSchema,
} from './metrics.js';

describe('可观测性契约', () => {
  it('解析 health 响应', () => {
    expect(HealthResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('解析 LLM 调用指标', () => {
    expect(
      LlmCallMetricSchema.parse({
        id: '00000000-0000-4000-8000-000000000001',
        traceId: '00000000-0000-4000-8000-000000000002',
        operation: 'stream',
        model: 'qwen3.5:2b',
        promptTokens: 100,
        completionTokens: 20,
        contextLimitTokens: 8192,
        firstTokenMs: 1200,
        totalMs: 3400,
        tokensPerSecond: 5.8,
        finishReason: 'length',
        toolCallCount: 0,
        toolCallValid: 0,
        recordedAt: '2026-08-27T00:00:00.000Z',
      }).finishReason,
    ).toBe('length');
  });

  it('解析指标快照响应', () => {
    expect(
      ObservabilityMetricsResponseSchema.parse({
        calls: [],
        summary: {
          totalCalls: 0,
          finishReasonCounts: {},
          contextUsageBuckets: { low: 0, medium: 0, high: 0 },
          averageTotalMs: 0,
          operationAverageMs: {},
        },
      }).summary.totalCalls,
    ).toBe(0);
  });
});
