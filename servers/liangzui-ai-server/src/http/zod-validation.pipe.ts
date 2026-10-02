import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { ApiErrorSchema } from '@ai-engine/contracts';

type ZodLikeSchema = {
  safeParse: (
    value: unknown,
  ) => { success: true; data: unknown } | { success: false; error: { issues: unknown } };
};

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodLikeSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(
        ApiErrorSchema.parse({
          code: 'BAD_REQUEST',
          message: '请求参数不合法',
          details: result.error.issues,
        }),
      );
    }
    return result.data;
  }
}
