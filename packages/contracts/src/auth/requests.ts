import { z } from 'zod';
import { IdentifierInputSchema, VerificationPurposeSchema } from './identity.js';
import { PasswordSchema, VerificationCodeSchema } from './password.js';

export const SendCodeRequestSchema = IdentifierInputSchema.and(
  z.object({ purpose: VerificationPurposeSchema }),
);
export type SendCodeRequest = z.infer<typeof SendCodeRequestSchema>;

export const RegisterRequestSchema = IdentifierInputSchema.and(
  z.object({
    password: PasswordSchema,
    displayName: z.string().trim().min(1).max(40).optional(),
    code: VerificationCodeSchema,
  }),
);
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const PasswordLoginRequestSchema = IdentifierInputSchema.and(
  z.object({ password: PasswordSchema }),
);
export type PasswordLoginRequest = z.infer<typeof PasswordLoginRequestSchema>;

export const CodeLoginRequestSchema = IdentifierInputSchema.and(
  z.object({ code: VerificationCodeSchema }),
);
export type CodeLoginRequest = z.infer<typeof CodeLoginRequestSchema>;

export const ResetPasswordRequestSchema = IdentifierInputSchema.and(
  z.object({
    code: VerificationCodeSchema,
    password: PasswordSchema,
  }),
);
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;
