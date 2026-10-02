import { z } from 'zod';

/** 上限用于约束哈希输入长度，避免超长密码被用来放大 scrypt 计算开销。 */
export const PasswordSchema = z.string().min(8).max(72);
export type Password = z.infer<typeof PasswordSchema>;

export const VerificationCodeSchema = z.string().regex(/^\d{6}$/);
