import { HttpException, ServiceUnavailableException, type HttpStatus } from '@nestjs/common';
import { ApiErrorSchema, type ErrorCode } from '@ai-engine/contracts';

export function throwAuthError(status: HttpStatus, code: ErrorCode, message: string): never {
  throw new HttpException(ApiErrorSchema.parse({ code, message }), status);
}

export function throwAuthUnavailable(): never {
  throw new ServiceUnavailableException(
    ApiErrorSchema.parse({
      code: 'SERVICE_UNAVAILABLE',
      message: '认证需要 PostgreSQL，请配置 DATABASE_URL 后重试',
    }),
  );
}

export const isUniqueViolation = (error: unknown): boolean => {
  const pending = [error];
  const seen = new Set<unknown>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if ('code' in current && current.code === '23505') return true;
    if ('cause' in current) pending.push(current.cause);
  }
  return false;
};
