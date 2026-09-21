import type { INestApplication } from '@nestjs/common';
import { ApiErrorFilter } from './api-error.filter';

export const applyHttpSetup = (app: INestApplication): INestApplication => {
  app.enableCors();
  app.useGlobalFilters(new ApiErrorFilter());
  return app;
};
