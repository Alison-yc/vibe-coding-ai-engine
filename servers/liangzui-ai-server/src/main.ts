import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { applyHttpSetup } from './http/setup-http';

async function bootstrap() {
  const app = applyHttpSetup(
    await NestFactory.create(AppModule, {
      bufferLogs: true,
    }),
  );
  app.useLogger(app.get(Logger));
  await app.listen(process.env.PORT ?? process.env.SERVER_PORT ?? 3000);
}
void bootstrap();
