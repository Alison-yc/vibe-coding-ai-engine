import { z } from 'zod';

export const IdentityTypeSchema = z.enum(['email', 'phone']);
export type IdentityType = z.infer<typeof IdentityTypeSchema>;

export const VerificationPurposeSchema = z.enum(['register', 'login', 'reset_password']);
export type VerificationPurpose = z.infer<typeof VerificationPurposeSchema>;

const MAINLAND_MOBILE = /^1[3-9]\d{9}$/;

export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

/** 只接受中国大陆 11 位手机号，可带 +86 / 86 前缀与空格、连字符。非法时返回 null。 */
export const normalizePhone = (raw: string): string | null => {
  const compact = raw.trim().replace(/[\s-]/g, '');
  let national = compact;
  if (compact.startsWith('+86')) national = compact.slice(3);
  else if (compact.startsWith('86') && compact.length === 13) national = compact.slice(2);
  if (!MAINLAND_MOBILE.test(national)) return null;
  return `+86${national}`;
};

const reject = (ctx: z.RefinementCtx, message: string) => {
  ctx.addIssue({ code: 'custom', message });
  return z.NEVER;
};

export const EmailIdentifierSchema = z.string().transform((value, ctx) => {
  const normalized = normalizeEmail(value);
  const parsed = z.email().safeParse(normalized);
  if (!parsed.success) return reject(ctx, '邮箱格式无效');
  return parsed.data;
});

export const PhoneIdentifierSchema = z.string().transform((value, ctx) => {
  const normalized = normalizePhone(value);
  if (!normalized) return reject(ctx, '手机号需为大陆 11 位');
  return normalized;
});

export const IdentifierInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('email'), identifier: EmailIdentifierSchema }),
  z.object({ type: z.literal('phone'), identifier: PhoneIdentifierSchema }),
]);
export type IdentifierInput = z.infer<typeof IdentifierInputSchema>;
