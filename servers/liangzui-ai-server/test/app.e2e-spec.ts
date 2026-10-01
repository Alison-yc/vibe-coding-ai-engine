import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { ApiErrorSchema } from '@ai-engine/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module';
import type { AppConfig } from './../src/config/ollama.config';
import { shouldUsePostgres } from './../src/database/database.providers';
import { applyHttpSetup } from './../src/http/setup-http';

describe('App HTTP (e2e)', () => {
  let app: INestApplication<App>;

  // 每次重建 AppModule 都要拉起并关闭 MCP 子进程（约 4 秒），整个文件只启动一次。
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = applyHttpSetup(moduleFixture.createNestApplication());
    await app.init();
  });

  it('/health 公开可访问', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok' });
  });

  it('受保护接口无 token 返回 401 契约错误体', async () => {
    const response = await request(app.getHttpServer())
      .post('/llm/translate')
      .send({ text: 123 })
      .expect(401);

    expect(ApiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('伪造 token 不放行：无库 503，有库 401', async () => {
    const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
    const hasDatabase = shouldUsePostgres({
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
      DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
      RUN_DB_INTEGRATION: config.get('RUN_DB_INTEGRATION', { infer: true }),
    });
    const response = await request(app.getHttpServer())
      .get('/chat/sessions')
      .set('authorization', 'Bearer forged-token')
      .expect(hasDatabase ? 401 : 503);

    expect(response.body).toMatchObject({
      code: hasDatabase ? 'UNAUTHORIZED' : 'SERVICE_UNAVAILABLE',
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
