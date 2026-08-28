import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { AppConfig } from './config/ollama.config';
import { applyHttpSetup } from './http/setup-http';
import { watchParentProcess } from './sidecar-parent-monitor';

async function bootstrap() {
  const app = applyHttpSetup(
    await NestFactory.create(AppModule, {
      bufferLogs: true,
    }),
  );
  const logger = app.get(Logger);
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  app.useLogger(logger);
  app.enableShutdownHooks();
  await app.listen(config.get('SERVER_PORT', { infer: true }), '127.0.0.1');

  const parentPid = config.get('SIDECAR_PARENT_PID', { infer: true });
  if (config.get('SIDECAR_MODE', { infer: true }) && parentPid) {
    watchParentProcess({
      parentPid,
      onParentExit: () => {
        logger.warn({ operation: 'sidecar-parent-exited', parentPid });
        void app.close().catch((error: unknown) => {
          logger.error({
            operation: 'sidecar-shutdown-failed',
            error: error instanceof Error ? error.message : String(error),
          });
        });
      },
    });
  }
}
void bootstrap();
