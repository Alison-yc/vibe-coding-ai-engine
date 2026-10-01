import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { readBearer } from './auth-http';
import { throwAuthError } from './auth.errors';
import { AuthService, type AuthPrincipal } from './auth.service';

type RequestWithPrincipal = Request & { principal?: AuthPrincipal };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const token = readBearer(request.header('authorization') ?? undefined);
    if (!token) throwAuthError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', '缺少登录凭证');
    request.principal = await this.auth.authenticate(token);
    return true;
  }
}
