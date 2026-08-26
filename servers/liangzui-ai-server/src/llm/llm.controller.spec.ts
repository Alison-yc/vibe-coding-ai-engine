import 'reflect-metadata';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppService } from '../app.service';
import { LlmController } from './llm.controller';

describe('LlmController', () => {
  let controller: LlmController;
  let appService: AppService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [LlmController],
      providers: [AppService],
    }).compile();

    controller = app.get(LlmController);
    appService = app.get(AppService);
  });

  it('把已校验的文本交给 AppService 并包装响应', async () => {
    vi.spyOn(appService, 'translate').mockResolvedValueOnce('Hello');
    await expect(controller.translate({ text: '你好' })).resolves.toEqual({ text: 'Hello' });
  });
});
