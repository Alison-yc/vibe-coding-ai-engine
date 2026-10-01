import { createHash } from 'node:crypto';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { expect } from 'vitest';
import type { AuthRuntimeConfig } from './auth.config';
import type { AuthRequestMeta } from './auth-http';
import { AuthService } from './auth.service';
import { MemoryAuthRepository } from './memory-auth.repository';
import type { PasswordHasher } from './password-hasher';
import { SessionTokenService } from './session-token';
import { StaticVerificationCodeSender } from './verification-code-sender';
import { type AuthLogger, VerificationService } from './verification.service';

export class FakePasswordHasher {
  dummyCalls = 0;
  private readonly known = new Map<string, string>();

  hash(password: string): Promise<string> {
    const stored = `fake$${createHash('sha256').update(password).digest('hex')}`;
    this.known.set(stored, password);
    return Promise.resolve(stored);
  }

  verify(password: string, stored: string): Promise<boolean> {
    return Promise.resolve(this.known.get(stored) === password);
  }

  dummyVerify(_password: string): Promise<void> {
    this.dummyCalls += 1;
    return Promise.resolve();
  }
}

export const testAuthConfig = (override?: Partial<AuthRuntimeConfig>): AuthRuntimeConfig => ({
  verificationMode: 'static',
  staticCode: '246810',
  sessionTtlDays: 7,
  guestTtlDays: 30,
  nodeEnv: 'test',
  ...override,
});

export const testMeta = (override?: Partial<AuthRequestMeta>): AuthRequestMeta => ({
  client: 'web',
  userAgent: 'vitest',
  ...override,
});

export const createAuthHarness = (override?: Partial<AuthRuntimeConfig>) => {
  const repo = new MemoryAuthRepository();
  const config = testAuthConfig(override);
  const logs: string[] = [];
  const logger: AuthLogger = {
    info: (fields, message) => logs.push(JSON.stringify({ fields, message })),
    warn: (fields, message) => logs.push(JSON.stringify({ fields, message })),
  };
  const passwords = new FakePasswordHasher();
  const tokens = new SessionTokenService();
  const verification = new VerificationService(
    repo,
    config,
    new StaticVerificationCodeSender(),
    logger,
  );
  const auth = new AuthService(
    repo,
    passwords as unknown as PasswordHasher,
    tokens,
    verification,
    config,
    logger,
  );
  return { repo, config, logs, passwords, tokens, verification, auth, logger };
};

export const expectAuthError = async (
  run: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> => {
  try {
    await run;
    expect.fail('应该抛出认证错误');
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    if (error instanceof ServiceUnavailableException) {
      expect.fail('不应是 503');
    }
    if (!(error instanceof HttpException)) return;
    expect(error.getStatus()).toBe(status);
    expect(error.getResponse()).toMatchObject({ code });
  }
};
