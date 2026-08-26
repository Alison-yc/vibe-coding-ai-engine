import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ApiErrorSchema } from '@ai-engine/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module';
import { applyHttpSetup } from './../src/http/setup-http';

describe('App HTTP (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = applyHttpSetup(moduleFixture.createNestApplication());
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
  });

  it('POST /llm/translate 在 text 非字符串时返回契约错误体', async () => {
    const response = await request(app.getHttpServer())
      .post('/llm/translate')
      .send({ text: 123 })
      .expect(400);

    expect(ApiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toMatchObject({ code: 'BAD_REQUEST' });
  });

  afterEach(async () => {
    await app.close();
  });
});
