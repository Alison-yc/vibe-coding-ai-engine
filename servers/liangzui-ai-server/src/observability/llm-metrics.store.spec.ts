import { describe, expect, it } from 'vitest';
import { LlmMetricsStore } from './llm-metrics.store';

const sampleMetric = (overrides: Partial<Parameters<LlmMetricsStore['record']>[0]> = {}) => ({
  id: '00000000-0000-4000-8000-000000000001',
  traceId: '00000000-0000-4000-8000-000000000002',
  operation: 'chat' as const,
  model: 'qwen3.5:2b',
  promptTokens: 100,
  completionTokens: 20,
  contextLimitTokens: 8192,
  firstTokenMs: 1200,
  totalMs: 3400,
  tokensPerSecond: 5.8,
  finishReason: 'stop',
  toolCallCount: 0,
  toolCallValid: 0,
  recordedAt: new Date().toISOString(),
  ...overrides,
});

describe('LlmMetricsStore', () => {
  it('只保留最近 50 条记录', () => {
    const store = new LlmMetricsStore();
    for (let index = 0; index < 55; index += 1) {
      store.record(
        sampleMetric({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` }),
      );
    }
    expect(store.list()).toHaveLength(50);
  });

  it('汇总 finishReason 与上下文用量分布', () => {
    const store = new LlmMetricsStore();
    store.record(sampleMetric({ finishReason: 'stop', promptTokens: 1000 }));
    store.record(sampleMetric({ finishReason: 'length', promptTokens: 7000 }));
    const summary = store.summarize();
    expect(summary.finishReasonCounts.stop).toBe(1);
    expect(summary.finishReasonCounts.length).toBe(1);
    expect(summary.contextUsageBuckets.high).toBe(1);
    expect(summary.contextUsageBuckets.low).toBe(1);
  });
});
