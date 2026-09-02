import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { AddressInfo } from 'node:net';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { readOllamaConfig, type AppConfig } from './config/ollama.config';
import { applyHttpSetup } from './http/setup-http';
import {
  SIDECAR_READY_PREFIX,
  sidecarReadyUrl,
  watchParentProcess,
} from './sidecar-parent-monitor';

async function bootstrap() {
  const startupConfig = readOllamaConfig();
  const parentPid = startupConfig.SIDECAR_MODE ? startupConfig.SIDECAR_PARENT_PID : undefined;
  const runtime: { app?: INestApplication; logger?: Logger; ready: boolean } = { ready: false };

  if (parentPid) {
    watchParentProcess({
      parentPid,
      onParentExit: () => {
        const runningApp = runtime.app;
        if (!runningApp || !runtime.ready) process.exit(0);
        runtime.logger?.warn({ operation: 'sidecar-parent-exited', parentPid });
        void runningApp.close().then(
          () => process.exit(0),
          (error: unknown) => {
            runtime.logger?.error({
              operation: 'sidecar-shutdown-failed',
              error: error instanceof Error ? error.message : String(error),
            });
            process.exit(1);
          },
        );
      },
    });
  }

  const app = applyHttpSetup(
    await NestFactory.create(AppModule, {
      bufferLogs: true,
    }),
  );
  runtime.app = app;
  const appLogger = app.get(Logger);
  runtime.logger = appLogger;
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  app.useLogger(appLogger);
  app.enableShutdownHooks();
  await app.listen(config.get('SERVER_PORT', { infer: true }), '127.0.0.1');
  runtime.ready = true;

  if (config.get('SIDECAR_MODE', { infer: true })) {
    const httpServer = app.getHttpServer() as {
      address(): AddressInfo | string | null;
    };
    process.stdout.write(`${SIDECAR_READY_PREFIX}${sidecarReadyUrl(httpServer.address())}\n`);
  }
}
void bootstrap();
