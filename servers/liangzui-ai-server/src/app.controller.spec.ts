import 'reflect-metadata';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FakeLlmGateway } from './llm/fake-llm-gateway';
import { LLM_GATEWAY } from './llm/llm-gateway';

describe('AppController', () => {
  let appController: AppController;

  it('在 Vitest 转换后保留 NestJS 构造器元数据', () => {
    expect(Reflect.getMetadata('design:paramtypes', AppController)).toEqual([AppService]);
  });

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: LLM_GATEWAY, useValue: new FakeLlmGateway() }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  it('转发 prompt 请求', () => {
    expect(appController.prompt('Cursor')).toBe('Hello, Cursor!');
  });
});
