import 'reflect-metadata';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppService } from '../app.service';
import { FakeLlmGateway } from './fake-llm-gateway';
import { LLM_GATEWAY } from './llm-gateway';
import { LlmController } from './llm.controller';

describe('LlmController', () => {
  let controller: LlmController;
  let appService: AppService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [LlmController],
      providers: [AppService, { provide: LLM_GATEWAY, useValue: new FakeLlmGateway() }],
    }).compile();

    controller = app.get(LlmController);
    appService = app.get(AppService);
  });

  it('把已校验的文本交给 AppService 并包装响应', async () => {
    vi.spyOn(appService, 'translate').mockResolvedValueOnce('Hello');
    const request = { on: vi.fn() };
    await expect(controller.translate(request as never, { text: '你好' })).resolves.toEqual({
      text: 'Hello',
    });
    expect(appService.translate).toHaveBeenCalledWith('你好', expect.any(AbortSignal));
  });
});
