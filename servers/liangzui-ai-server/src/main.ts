import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { applyHttpSetup } from './http/setup-http';

async function bootstrap() {
  const app = applyHttpSetup(await NestFactory.create(AppModule));
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
