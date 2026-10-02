import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/ollama.config';
import { ApiErrorFilter } from './api-error.filter';

export const applyHttpSetup = (app: INestApplication): INestApplication => {
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }) });
  app.useGlobalFilters(new ApiErrorFilter());
  return app;
};
