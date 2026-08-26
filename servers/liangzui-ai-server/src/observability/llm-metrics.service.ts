import { randomUUID } from 'node:crypto';
import {
  LlmCallMetricSchema,
  ObservabilityMetricsResponseSchema,
  type LlmCallMetric,
  type LlmOperation,
  type ObservabilityMetricsResponse,
} from '@ai-engine/contracts';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/ollama.config';
import { LlmMetricsStore } from './llm-metrics.store';
import { getTraceId } from './request-context';

export type RecordLlmMetricInput = {
  operation: LlmOperation;
  model: string;
  promptTokens: number;
  completionTokens: number;
  firstTokenMs: number | null;
  totalMs: number;
  finishReason?: string | null;
  toolCallCount?: number;
  toolCallValid?: number;
  traceId?: string;
};

@Injectable()
export class LlmMetricsService {
  constructor(
    private readonly store: LlmMetricsStore,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  record(input: RecordLlmMetricInput): LlmCallMetric {
    const totalMs = Math.max(input.totalMs, 0);
    const completionTokens = Math.max(input.completionTokens, 0);
    const tokensPerSecond =
      completionTokens > 0 && totalMs > 0 ? (completionTokens / totalMs) * 1000 : null;

    const metric = LlmCallMetricSchema.parse({
      id: randomUUID(),
      traceId: input.traceId ?? getTraceId() ?? randomUUID(),
      operation: input.operation,
      model: input.model,
      promptTokens: Math.max(input.promptTokens, 0),
      completionTokens,
      contextLimitTokens: this.config.get('OLLAMA_NUM_CTX', { infer: true }),
      firstTokenMs: input.firstTokenMs,
      totalMs,
      tokensPerSecond,
      finishReason: input.finishReason ?? null,
      toolCallCount: input.toolCallCount ?? 0,
      toolCallValid: input.toolCallValid ?? 0,
      recordedAt: new Date().toISOString(),
    });
    this.store.record(metric);
    return metric;
  }

  snapshot(): ObservabilityMetricsResponse {
    return ObservabilityMetricsResponseSchema.parse({
      calls: [...this.store.list()],
      summary: this.store.summarize(),
    });
  }
}
