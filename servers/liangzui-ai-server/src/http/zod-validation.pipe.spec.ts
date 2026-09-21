import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ApiErrorSchema, TranslateRequestSchema } from '@ai-engine/contracts';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(TranslateRequestSchema);

  it('返回解析后的数据', () => {
    expect(pipe.transform({ text: '你好' })).toEqual({ text: '你好' });
  });

  it('非法输入抛出符合契约的 400 错误体', () => {
    try {
      pipe.transform({ text: 123 });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse();
      expect(ApiErrorSchema.safeParse(body).success).toBe(true);
    }
  });
});
