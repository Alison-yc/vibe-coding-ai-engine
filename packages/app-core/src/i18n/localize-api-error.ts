import { ErrorCodeSchema, type ErrorCode } from '@ai-engine/contracts';

export type TranslateError = (key: string) => string;

const errorCodeFrom = (error: unknown): ErrorCode | null => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const parsed = ErrorCodeSchema.safeParse(error.code);
  return parsed.success ? parsed.data : null;
};

export const localizeApiError = (error: unknown, translate: TranslateError): string => {
  const code = errorCodeFrom(error);
  if (code) return translate(`api.${code}`);
  if (error instanceof Error) return error.message;
  return String(error);
};
