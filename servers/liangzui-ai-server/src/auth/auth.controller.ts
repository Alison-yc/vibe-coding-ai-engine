import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import {
  CodeLoginRequestSchema,
  PasswordLoginRequestSchema,
  RegisterRequestSchema,
  ResetPasswordRequestSchema,
  SendCodeRequestSchema,
  UuidSchema,
  type CodeLoginRequest,
  type PasswordLoginRequest,
  type RegisterRequest,
  type ResetPasswordRequest,
  type SendCodeRequest,
} from '@ai-engine/contracts';
import { readAuthRequestMeta } from './auth-http';
import { Authenticated, Public } from './access-policy';
import { AuthService, type AuthPrincipal } from './auth.service';
import { CurrentPrincipal } from './current-principal';
import { ZodValidationPipe } from '../http/zod-validation.pipe';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Post('guest')
  @HttpCode(200)
  issueGuest(
    @Headers('authorization') authorization?: string | string[],
    @Headers('user-agent') userAgent?: string | string[],
    @Headers('x-client') client?: string | string[],
  ) {
    return this.auth.issueGuest(readAuthRequestMeta(authorization, userAgent, client));
  }

  @Public()
  @Post('verification-codes')
  @HttpCode(200)
  sendCode(@Body(new ZodValidationPipe(SendCodeRequestSchema)) body: SendCodeRequest) {
    return this.auth.sendCode(body);
  }

  @Public()
  @Post('register')
  @HttpCode(200)
  register(
    @Body(new ZodValidationPipe(RegisterRequestSchema)) body: RegisterRequest,
    @Headers('authorization') authorization?: string | string[],
    @Headers('user-agent') userAgent?: string | string[],
    @Headers('x-client') client?: string | string[],
  ) {
    return this.auth.register(body, readAuthRequestMeta(authorization, userAgent, client));
  }

  @Public()
  @Post('login/password')
  @HttpCode(200)
  loginWithPassword(
    @Body(new ZodValidationPipe(PasswordLoginRequestSchema)) body: PasswordLoginRequest,
    @Headers('user-agent') userAgent?: string | string[],
    @Headers('x-client') client?: string | string[],
  ) {
    return this.auth.loginWithPassword(body, readAuthRequestMeta(undefined, userAgent, client));
  }

  @Public()
  @Post('login/code')
  @HttpCode(200)
  loginWithCode(
    @Body(new ZodValidationPipe(CodeLoginRequestSchema)) body: CodeLoginRequest,
    @Headers('user-agent') userAgent?: string | string[],
    @Headers('x-client') client?: string | string[],
  ) {
    return this.auth.loginWithCode(body, readAuthRequestMeta(undefined, userAgent, client));
  }

  @Public()
  @Post('password-resets')
  @HttpCode(204)
  resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordRequestSchema)) body: ResetPasswordRequest,
  ) {
    return this.auth.resetPassword(body);
  }

  @Post('logout')
  @HttpCode(204)
  @Authenticated()
  logout(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.auth.logout(principal);
  }

  @Get('me')
  @Authenticated()
  me(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.auth.me(principal);
  }

  @Get('sessions')
  @Authenticated()
  listSessions(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.auth.listSessions(principal);
  }

  @Delete('sessions/:sessionId')
  @Authenticated()
  revokeSession(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('sessionId', new ZodValidationPipe(UuidSchema)) sessionId: string,
  ) {
    return this.auth.revokeDevice(principal, sessionId);
  }
}
