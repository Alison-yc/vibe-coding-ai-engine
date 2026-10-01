import { z } from 'zod';
import { TimestampSchema, UuidSchema } from '../common/primitives.js';
import { IdentityTypeSchema } from './identity.js';
import { PermissionSchema, RoleKeySchema } from './permissions.js';

export const AuthUserSchema = z.object({
  id: UuidSchema,
  kind: z.enum(['guest', 'registered']),
  displayName: z.string().nullable(),
  roles: z.array(RoleKeySchema),
  permissions: z.array(PermissionSchema),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const AuthSessionResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: TimestampSchema,
  user: AuthUserSchema,
});
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;

export const AuthIdentityViewSchema = z.object({
  type: IdentityTypeSchema,
  identifier: z.string().min(1),
  verifiedAt: TimestampSchema.nullable(),
});

export const MeResponseSchema = z.object({
  user: AuthUserSchema,
  identities: z.array(AuthIdentityViewSchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const SendCodeResponseSchema = z.object({
  expiresInSec: z.number().int().positive(),
  resendAfterSec: z.number().int().nonnegative(),
});
export type SendCodeResponse = z.infer<typeof SendCodeResponseSchema>;
