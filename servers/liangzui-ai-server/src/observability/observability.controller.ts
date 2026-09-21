import {
  HealthResponseSchema,
  ObservabilityMetricsResponseSchema,
  type HealthResponse,
  type ObservabilityMetricsResponse,
} from '@ai-engine/contracts';
import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/ollama.config';
import { LlmMetricsService } from './llm-metrics.service';

@Controller()
export class ObservabilityController {
  constructor(
    private readonly metricsService: LlmMetricsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Get('health')
  health(): HealthResponse {
    return HealthResponseSchema.parse({
      status: 'ok',
      chatModel: this.config.get('OLLAMA_MODEL', { infer: true }),
      embeddingModel: this.config.get('OLLAMA_EMBED_MODEL', { infer: true }),
      numCtx: this.config.get('OLLAMA_NUM_CTX', { infer: true }),
      numPredict: this.config.get('OLLAMA_NUM_PREDICT', { infer: true }),
      temperature: this.config.get('OLLAMA_TEMPERATURE', { infer: true }),
      vectorStore: this.config.get('DATABASE_URL', { infer: true }) ? 'postgres' : 'memory',
    });
  }

  @Get('dev/observability/metrics')
  getMetrics(): ObservabilityMetricsResponse {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new NotFoundException();
    }
    return ObservabilityMetricsResponseSchema.parse(this.metricsService.snapshot());
  }
}
