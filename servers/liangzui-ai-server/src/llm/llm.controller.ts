import { Body, Controller, Inject, Post, Req } from '@nestjs/common';
import {
  TranslateRequestSchema,
  TranslateResponseSchema,
  type TranslateRequest,
  type TranslateResponse,
} from '@ai-engine/contracts';
import type { Request } from 'express';
import { AppService } from '../app.service';
import { abortOnClientClose } from '../http/abort-on-client-close';
import { ZodValidationPipe } from '../http/zod-validation.pipe';

@Controller('llm')
export class LlmController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @Post('translate')
  async translate(
    @Req() request: Request,
    @Body(new ZodValidationPipe(TranslateRequestSchema)) body: TranslateRequest,
  ): Promise<TranslateResponse> {
    const text = await this.appService.translate(body.text, abortOnClientClose(request));
    return TranslateResponseSchema.parse({ text });
  }
}
