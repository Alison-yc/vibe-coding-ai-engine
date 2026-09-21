import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiErrorSchema, type ErrorCode } from '@ai-engine/contracts';
import {
  ContextOverflowError,
  LlmTimeoutError,
  ModelNotFoundError,
  OllamaUnreachableError,
} from '../llm/llm-errors';

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

const mapLlmError = (exception: unknown): { status: number; message: string } | undefined => {
  if (exception instanceof OllamaUnreachableError) {
    return { status: HttpStatus.SERVICE_UNAVAILABLE, message: exception.message };
  }
  if (exception instanceof LlmTimeoutError) {
    return { status: HttpStatus.SERVICE_UNAVAILABLE, message: exception.message };
  }
  if (exception instanceof ModelNotFoundError) {
    return { status: HttpStatus.NOT_FOUND, message: exception.message };
  }
  if (exception instanceof ContextOverflowError) {
    return { status: HttpStatus.BAD_REQUEST, message: exception.message };
  }
  return undefined;
};

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const llmMapped = mapLlmError(exception);
    if (llmMapped) {
      response.status(llmMapped.status).json(
        ApiErrorSchema.parse({
          code: statusToCode(llmMapped.status),
          message: llmMapped.message,
        }),
      );
      return;
    }

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
