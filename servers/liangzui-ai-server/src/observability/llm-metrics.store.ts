import {
  LlmCallMetricSchema,
  ObservabilitySummarySchema,
  type LlmCallMetric,
  type ObservabilitySummary,
} from '@ai-engine/contracts';

export const LLM_METRICS_BUFFER_SIZE = 50;

const emptySummary = (): ObservabilitySummary =>
  ObservabilitySummarySchema.parse({
    totalCalls: 0,
    finishReasonCounts: {},
    contextUsageBuckets: { low: 0, medium: 0, high: 0 },
    averageTotalMs: 0,
    operationAverageMs: {},
  });

const bucketContextUsage = (
  promptTokens: number,
  contextLimitTokens: number,
): 'low' | 'medium' | 'high' => {
  const ratio = contextLimitTokens === 0 ? 0 : promptTokens / contextLimitTokens;
  if (ratio >= 0.8) return 'high';
  if (ratio >= 0.5) return 'medium';
  return 'low';
};

export class LlmMetricsStore {
  private readonly entries: LlmCallMetric[] = [];

  record(metric: LlmCallMetric): void {
    const parsed = LlmCallMetricSchema.parse(metric);
    this.entries.unshift(parsed);
    if (this.entries.length > LLM_METRICS_BUFFER_SIZE) {
      this.entries.length = LLM_METRICS_BUFFER_SIZE;
    }
  }

  list(): readonly LlmCallMetric[] {
    return this.entries;
  }

  clear(): void {
    this.entries.length = 0;
  }

  summarize(): ObservabilitySummary {
    if (this.entries.length === 0) return emptySummary();

    const finishReasonCounts: Record<string, number> = {};
    const contextUsageBuckets = { low: 0, medium: 0, high: 0 };
    const operationTotals = new Map<string, { totalMs: number; count: number }>();
    let totalMs = 0;

    for (const entry of this.entries) {
      totalMs += entry.totalMs;
      const bucket = bucketContextUsage(entry.promptTokens, entry.contextLimitTokens);
      contextUsageBuckets[bucket] += 1;

      const reason = entry.finishReason ?? 'unknown';
      finishReasonCounts[reason] = (finishReasonCounts[reason] ?? 0) + 1;

      const operationStats = operationTotals.get(entry.operation) ?? { totalMs: 0, count: 0 };
      operationStats.totalMs += entry.totalMs;
      operationStats.count += 1;
      operationTotals.set(entry.operation, operationStats);
    }

    const operationAverageMs = Object.fromEntries(
      [...operationTotals.entries()].map(([operation, stats]) => [
        operation,
        stats.totalMs / stats.count,
      ]),
    );

    return ObservabilitySummarySchema.parse({
      totalCalls: this.entries.length,
      finishReasonCounts,
      contextUsageBuckets,
      averageTotalMs: totalMs / this.entries.length,
      operationAverageMs,
    });
  }
}
