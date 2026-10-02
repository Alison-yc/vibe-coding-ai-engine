import { SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Permission } from '@ai-engine/contracts';

export const ACCESS_POLICY_KEY = 'auth:access-policy';

/**
 * 每条路由必须显式声明三者之一；没有声明的路由被 `PermissionsGuard` 拒绝，
 * 完整性测试也会失败。方法上的声明优先于类上的声明。
 */
export type AccessPolicy =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'permissions'; permissions: readonly Permission[] };

export const Public = () =>
  SetMetadata(ACCESS_POLICY_KEY, { kind: 'public' } satisfies AccessPolicy);

/** 任意有效 token（含访客）。 */
export const Authenticated = () =>
  SetMetadata(ACCESS_POLICY_KEY, { kind: 'authenticated' } satisfies AccessPolicy);

export const RequirePermissions = (...permissions: [Permission, ...Permission[]]) =>
  SetMetadata(ACCESS_POLICY_KEY, { kind: 'permissions', permissions } satisfies AccessPolicy);

export const readAccessPolicy = (
  reflector: Reflector,
  context: ExecutionContext,
): AccessPolicy | undefined =>
  reflector.getAllAndOverride<AccessPolicy | undefined>(ACCESS_POLICY_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
