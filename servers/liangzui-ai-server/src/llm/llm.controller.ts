import { Body, Controller, Inject, Post } from '@nestjs/common';
import {
  TranslateRequestSchema,
  TranslateResponseSchema,
  type TranslateRequest,
  type TranslateResponse,
} from '@ai-engine/contracts';
import { AppService } from '../app.service';
import { ZodValidationPipe } from '../http/zod-validation.pipe';

@Controller('llm')
export class LlmController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @Post('translate')
  async translate(
    @Body(new ZodValidationPipe(TranslateRequestSchema)) body: TranslateRequest,
  ): Promise<TranslateResponse> {
    const text = await this.appService.translate(body.text);
    return TranslateResponseSchema.parse({ text });
  }
}
