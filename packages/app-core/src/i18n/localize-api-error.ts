import { ErrorCodeSchema, type ErrorCode } from '@ai-engine/contracts';

export type TranslateError = (key: string) => string;

export const apiErrorCodeFrom = (error: unknown): ErrorCode | null => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const parsed = ErrorCodeSchema.safeParse(error.code);
  return parsed.success ? parsed.data : null;
};

export const localizeApiError = (
  error: unknown,
  translate: TranslateError,
  fallback?: string,
): string => {
  const code = apiErrorCodeFrom(error);
  if (code) return translate(`api.${code}`);
  if (error instanceof Error) return error.message;
  return fallback ?? String(error);
};
