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
    return HealthResponseSchema.parse({ status: 'ok' });
  }

  @Get('dev/observability/metrics')
  getMetrics(): ObservabilityMetricsResponse {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new NotFoundException();
    }
    return ObservabilityMetricsResponseSchema.parse(this.metricsService.snapshot());
  }
}
