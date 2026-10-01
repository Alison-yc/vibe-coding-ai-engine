import {
  IdentifierInputSchema,
  PasswordSchema,
  VerificationCodeSchema,
  type IdentifierInput,
  type IdentityType,
} from '@ai-engine/contracts';

export type AuthFieldError = 'identifier' | 'password' | 'confirmMismatch' | 'code' | 'displayName';

export const DISPLAY_NAME_MAX = 40;

export const inferIdentityType = (raw: string): IdentityType =>
  raw.includes('@') ? 'email' : 'phone';

export const parseIdentifier = (type: IdentityType, raw: string): IdentifierInput | null => {
  const parsed = IdentifierInputSchema.safeParse({ type, identifier: raw });
  return parsed.success ? parsed.data : null;
};

export const isValidPassword = (value: string): boolean => PasswordSchema.safeParse(value).success;

export const isValidCode = (value: string): boolean =>
  VerificationCodeSchema.safeParse(value.trim()).success;
