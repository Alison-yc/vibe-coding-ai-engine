import { createParamDecorator, HttpStatus, type ExecutionContext } from '@nestjs/common';
import { throwAuthError } from './auth.errors';
import type { AuthPrincipal } from './auth.service';

/** 只能用在非 Public 路由上；取不到身份说明 Guard 没有生效，按未登录拒绝而不是放行。 */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthPrincipal => {
    const request = context.switchToHttp().getRequest<{ principal?: AuthPrincipal }>();
    if (!request.principal) {
      throwAuthError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', '缺少登录凭证');
    }
    return request.principal;
  },
);
