import type { Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { PermissionsGuard } from './permissions.guard';

/** 默认拒绝：全局 Guard 按注册顺序执行，认证必须先于授权。 */
export const AUTH_GLOBAL_GUARDS: Provider[] = [
  { provide: APP_GUARD, useClass: AuthGuard },
  { provide: APP_GUARD, useClass: PermissionsGuard },
];
