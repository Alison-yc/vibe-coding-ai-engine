import { z } from 'zod';

export const PERMISSIONS = [
  'chat:basic',
  'chat:model-switch',
  'chat:tools',
  'chat:rag',
  'chat:file-access',
  'knowledge:read',
  'knowledge:write',
  'workflow:read',
  'workflow:write',
  'workflow:run',
  'mcp:read',
  'mcp:manage',
  'observability:read',
] as const;

export const PermissionSchema = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof PermissionSchema>;

export const ROLE_KEYS = ['guest', 'user', 'admin'] as const;
export const RoleKeySchema = z.enum(ROLE_KEYS);
export type RoleKey = z.infer<typeof RoleKeySchema>;

const USER_PERMISSIONS = PERMISSIONS.filter(
  (permission) => permission !== 'mcp:manage' && permission !== 'observability:read',
);

export const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  guest: ['chat:basic', 'chat:model-switch'],
  user: USER_PERMISSIONS,
  admin: PERMISSIONS,
};
