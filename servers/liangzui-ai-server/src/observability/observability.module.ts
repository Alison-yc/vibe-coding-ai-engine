import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { AppConfig } from '../config/ollama.config';
import { redactRequestBody } from './log-redaction';
import { LlmMetricsService } from './llm-metrics.service';
import { LlmMetricsStore } from './llm-metrics.store';
import { ObservabilityController } from './observability.controller';
import { traceIdLogProps } from './request-context';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const nodeEnv = config.get('NODE_ENV', { infer: true });
        return {
          pinoHttp: {
            level: nodeEnv === 'test' ? 'silent' : config.get('LOG_LEVEL', { infer: true }),
            transport:
              nodeEnv === 'development'
                ? {
                    target: 'pino-pretty',
                    options: {
                      singleLine: true,
                      colorize: true,
                      translateTime: 'HH:MM:ss',
                    },
                  }
                : undefined,
            autoLogging: {
              ignore: (request) => request.url === '/health',
            },
            customProps: (request) => traceIdLogProps(request),
            serializers: {
              req(request: { method?: string; url?: string; query?: unknown; body?: unknown }) {
                return {
                  method: request.method,
                  url: request.url,
                  query: request.query,
                  body: redactRequestBody(request.body),
                };
              },
            },
            mixin: () => traceIdLogProps(),
          },
        };
      },
    }),
  ],
  controllers: [ObservabilityController],
  providers: [LlmMetricsStore, LlmMetricsService],
  exports: [LoggerModule, LlmMetricsService],
})
export class ObservabilityModule {}
