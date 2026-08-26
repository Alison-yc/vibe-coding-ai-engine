import 'reflect-metadata';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  it('在 Vitest 转换后保留 NestJS 构造器元数据', () => {
    expect(Reflect.getMetadata('design:paramtypes', AppController)).toEqual([AppService]);
  });

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
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

    await expect(appController.ragQuery('我住哪')).resolves.toBe('北京');
  });
});
