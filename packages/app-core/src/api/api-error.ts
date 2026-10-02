import { ApiErrorSchema, type ApiError, type ErrorCode } from '@ai-engine/contracts';

export class ApiRequestError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.code = error.code;
    this.details = error.details;
    this.requestId = error.requestId;
  }
}

export const createApiRequestError = (
  payload: unknown,
  status: number,
  fallback = `HTTP ${status}`,
): Error => {
  const parsed = ApiErrorSchema.safeParse(payload);
  if (parsed.success) return new ApiRequestError(parsed.data);
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'message' in payload &&
    typeof payload.message === 'string'
  ) {
    return new Error(payload.message);
  }
  return new Error(fallback);
};
