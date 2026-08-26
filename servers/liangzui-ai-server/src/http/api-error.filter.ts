import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiErrorSchema, type ErrorCode } from '@ai-engine/contracts';

const statusToCode = (status: number): ErrorCode => {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 413) return 'PAYLOAD_TOO_LARGE';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 503) return 'SERVICE_UNAVAILABLE';
  return 'INTERNAL';
};

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const parsed = ApiErrorSchema.safeParse(raw);
      if (parsed.success) {
        response.status(status).json(parsed.data);
        return;
      }

      const message =
        typeof raw === 'string'
          ? raw
          : typeof raw === 'object' &&
              raw !== null &&
              'message' in raw &&
              typeof raw.message === 'string'
            ? raw.message
            : exception.message;

      response.status(status).json(
        ApiErrorSchema.parse({
          code: statusToCode(status),
          message,
        }),
      );
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
      ApiErrorSchema.parse({
        code: 'INTERNAL',
        message: '服务器内部错误',
      }),
    );
  }
}
