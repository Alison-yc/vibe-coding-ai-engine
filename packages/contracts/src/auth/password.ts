import { z } from 'zod';

/** scrypt 输入上限 72 字节按字符计；更长的密码在部分实现里会被静默截断。 */
export const PasswordSchema = z.string().min(8).max(72);
export type Password = z.infer<typeof PasswordSchema>;

export const VerificationCodeSchema = z.string().regex(/^\d{6}$/);
