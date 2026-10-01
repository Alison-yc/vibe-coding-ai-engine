import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { SendCodeRequest, SendCodeResponse } from '@ai-engine/contracts';
import { SendCodeResponseSchema } from '@ai-engine/contracts';
import { AUTH_CONFIG, type AuthRuntimeConfig } from './auth.config';
import {
  VERIFICATION_DAILY_LIMIT,
  VERIFICATION_DAILY_WINDOW_MS,
  VERIFICATION_EXPIRES_IN_SEC,
  VERIFICATION_MAX_ATTEMPTS,
  VERIFICATION_RESEND_MS,
  VERIFICATION_RESEND_SEC,
  VERIFICATION_TTL_MS,
} from './auth.constants';
import { throwAuthError, throwAuthUnavailable } from './auth.errors';
import { AUTH_REPOSITORY, type AuthRepository } from './auth.repository';
import { digestEqual, hashIdentifier, hashVerificationCode } from './identifier-hash';
import { VERIFICATION_CODE_SENDER, type VerificationCodeSender } from './verification-code-sender';

export type AuthLogger = {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
};

@Injectable()
export class VerificationService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repo: AuthRepository | null,
    @Inject(AUTH_CONFIG) private readonly config: AuthRuntimeConfig,
    @Inject(VERIFICATION_CODE_SENDER) private readonly sender: VerificationCodeSender,
    @Inject(PinoLogger) private readonly logger: AuthLogger,
  ) {}

  async send(input: SendCodeRequest): Promise<SendCodeResponse> {
    const repo = this.requireRepo();
    const now = Date.now();
    const recent = await repo.countCodesSince(
      input.type,
      input.identifier,
      new Date(now - VERIFICATION_RESEND_MS),
    );
    const daily = await repo.countCodesSince(
      input.type,
      input.identifier,
      new Date(now - VERIFICATION_DAILY_WINDOW_MS),
    );
    if (recent >= 1 || daily >= VERIFICATION_DAILY_LIMIT) {
      throwAuthError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', '请求过于频繁，请稍后再试');
    }

    const code = this.config.staticCode;
    await repo.insertVerificationCode({
      type: input.type,
      identifier: input.identifier,
      purpose: input.purpose,
      codeHash: hashVerificationCode(input.purpose, input.identifier, code),
      expiresAt: new Date(now + VERIFICATION_TTL_MS),
    });
    await this.sender.send({
      type: input.type,
      identifier: input.identifier,
      purpose: input.purpose,
      code,
    });
    await repo.insertEvent({
      type: 'code_sent',
      identifierHash: hashIdentifier(input.identifier),
    });
    this.log('info', '已签发验证码', input.identifier);
    return SendCodeResponseSchema.parse({
      expiresInSec: VERIFICATION_EXPIRES_IN_SEC,
      resendAfterSec: VERIFICATION_RESEND_SEC,
    });
  }

  async consume(
    input: { type: SendCodeRequest['type']; identifier: string; code: string },
    purpose: SendCodeRequest['purpose'],
  ): Promise<void> {
    const repo = this.requireRepo();
    const row = await repo.findLatestCode(input.type, input.identifier, purpose);
    if (
      !row ||
      row.consumedAt ||
      row.expiresAt.getTime() <= Date.now() ||
      row.attemptCount >= VERIFICATION_MAX_ATTEMPTS
    ) {
      throwAuthError(HttpStatus.BAD_REQUEST, 'VERIFICATION_CODE_INVALID', '验证码无效或已过期');
    }
    const updated = await repo.incrementCodeAttempt(row.id, VERIFICATION_MAX_ATTEMPTS);
    const expected = hashVerificationCode(purpose, input.identifier, input.code);
    if (!updated || !digestEqual(updated.codeHash, expected) || !(await repo.consumeCode(row.id))) {
      throwAuthError(HttpStatus.BAD_REQUEST, 'VERIFICATION_CODE_INVALID', '验证码无效或已过期');
    }
    if (this.config.nodeEnv === 'production') {
      this.logger.warn(
        {},
        '静态验证码校验成功。示例配置中的验证码视为公开，接入真实短信或邮件前不要依赖它',
      );
    }
  }

  private requireRepo(): AuthRepository {
    const repo = this.repo;
    if (!repo) throwAuthUnavailable();
    return repo;
  }

  private log(level: 'info' | 'warn', message: string, identifier: string): void {
    this.logger[level](
      {
        identifierLength: identifier.length,
        identifierHash: hashIdentifier(identifier).slice(0, 12),
      },
      message,
    );
  }
}
