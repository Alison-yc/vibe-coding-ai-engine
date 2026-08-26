import 'reflect-metadata';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InMemoryVectorStore } from './database/in-memory-vector-store';
import { VECTOR_STORE } from './database/vector-store';
import { FakeLlmGateway } from './llm/fake-llm-gateway';
import { LLM_GATEWAY } from './llm/llm-gateway';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  it('在 Vitest 转换后保留 NestJS 构造器元数据', () => {
    expect(Reflect.getMetadata('design:paramtypes', AppController)).toEqual([AppService]);
  });

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: LLM_GATEWAY, useValue: new FakeLlmGateway() },
        { provide: VECTOR_STORE, useClass: InMemoryVectorStore },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  it('转发 prompt 请求', () => {
    expect(appController.prompt('Cursor')).toBe('Hello, Cursor!');
  });

  it('转发 RAG 请求', async () => {
    vi.spyOn(appService, 'ragQuery').mockResolvedValueOnce('北京');
    const request = { on: vi.fn() };

    await expect(appController.ragQuery(request as never, '我住哪')).resolves.toBe('北京');
    expect(appService.ragQuery).toHaveBeenCalledWith('我住哪', expect.any(AbortSignal));
  });
});
