import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { readAccessPolicy } from './access-policy';
import { throwAuthError } from './auth.errors';
import type { RequestWithPrincipal } from './auth.guard';

/** 必须排在 `AuthGuard` 之后：依赖它写入的 `request.principal`。 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = readAccessPolicy(this.reflector, context);
    if (!policy) throwAuthError(HttpStatus.FORBIDDEN, 'FORBIDDEN', '该接口未声明访问策略');
    if (policy.kind === 'public') return true;
    const principal = context.switchToHttp().getRequest<RequestWithPrincipal>().principal;
    if (!principal) throwAuthError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', '缺少登录凭证');
    if (policy.kind === 'authenticated') return true;
    const granted = new Set(principal.permissions);
    if (!policy.permissions.every((permission) => granted.has(permission))) {
      throwAuthError(HttpStatus.FORBIDDEN, 'FORBIDDEN', '当前身份无权访问');
    }
    return true;
  }
}
