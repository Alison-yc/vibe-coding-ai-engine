import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthPrincipal } from './auth.service';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthPrincipal | undefined => {
    const request = context.switchToHttp().getRequest<{ principal?: AuthPrincipal }>();
    return request.principal;
  },
);
