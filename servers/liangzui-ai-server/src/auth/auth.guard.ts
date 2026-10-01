import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { readAccessPolicy } from './access-policy';
import { readBearer } from './auth-http';
import { throwAuthError } from './auth.errors';
import { AuthService, type AuthPrincipal } from './auth.service';

export type RequestWithPrincipal = Request & { principal?: AuthPrincipal };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (readAccessPolicy(this.reflector, context)?.kind === 'public') return true;
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const token = readBearer(request.header('authorization') ?? undefined);
    if (!token) throwAuthError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', '缺少登录凭证');
    request.principal = await this.auth.authenticate(token);
    return true;
  }
}
