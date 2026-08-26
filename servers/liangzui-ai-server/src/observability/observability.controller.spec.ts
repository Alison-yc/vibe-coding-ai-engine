import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../config/ollama.config';
import { LlmMetricsService } from './llm-metrics.service';
import { LlmMetricsStore } from './llm-metrics.store';
import { ObservabilityController } from './observability.controller';

const createConfig = (nodeEnv: AppConfig['NODE_ENV']) =>
  new ConfigService<AppConfig, true>({
    NODE_ENV: nodeEnv,
    LOG_LEVEL: 'silent',
    OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    OLLAMA_MODEL: 'qwen3.5:2b',
    OLLAMA_MODEL_LARGE: 'gemma4:e2b',
    OLLAMA_EMBED_MODEL: 'nomic-embed-text:latest',
    OLLAMA_NUM_CTX: 8192,
    OLLAMA_NUM_PREDICT: 2048,
    OLLAMA_TEMPERATURE: 0.2,
    OLLAMA_KEEP_ALIVE: '10m',
    RUN_DB_INTEGRATION: false,
  });

const createController = (nodeEnv: AppConfig['NODE_ENV']) => {
  const config = createConfig(nodeEnv);
  const metrics = new LlmMetricsService(new LlmMetricsStore(), config);
  return { controller: new ObservabilityController(metrics, config), metrics };
};

describe('ObservabilityController', () => {
  it('health 返回 ok', () => {
    const { controller } = createController('development');
    expect(controller.health()).toEqual({ status: 'ok' });
  });

  it('开发环境可读取指标快照', () => {
    const { controller, metrics } = createController('development');
    metrics.record({
      operation: 'chat',
      model: 'qwen3.5:2b',
      promptTokens: 10,
      completionTokens: 5,
      firstTokenMs: 100,
      totalMs: 500,
      finishReason: 'length',
    });
    const snapshot = controller.getMetrics();
    expect(snapshot.calls).toHaveLength(1);
    expect(snapshot.summary.finishReasonCounts.length).toBe(1);
  });

  it('生产环境隐藏 metrics 接口', () => {
    const { controller } = createController('production');
    expect(() => controller.getMetrics()).toThrow(NotFoundException);
  });
});
