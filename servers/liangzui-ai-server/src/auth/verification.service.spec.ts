import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthHarness, expectAuthError } from './auth-test-kit';
import type { AuthLogger } from './verification.service';
import { VerificationService } from './verification.service';
import { MemoryAuthRepository } from './memory-auth.repository';
import { testAuthConfig } from './auth-test-kit';

const email = { type: 'email' as const, identifier: 'user@example.com' };

describe('VerificationService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-02T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('只存验证码哈希，过期、已消费、用途不符和超次数都不能通过', async () => {
    const { verification, repo, logs } = createAuthHarness();
    await verification.send({ ...email, purpose: 'register' });
    expect(repo.codes[0]?.codeHash).not.toBe('246810');
    expect(Object.values(repo.codes[0] ?? {})).not.toContain('246810');

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await expectAuthError(
      verification.consume({ ...email, code: '246810' }, 'register'),
      400,
      'VERIFICATION_CODE_INVALID',
    );
    expect(repo.codes[0]?.consumedAt).toBeNull();
    expect(repo.codes[0]?.attemptCount).toBe(0);

    vi.setSystemTime(new Date('2026-10-02T00:00:00.000Z'));
    await verification.send({
      type: 'email',
      identifier: 'fresh@example.com',
      purpose: 'register',
    });
    await expectAuthError(
      verification.consume(
        { type: 'email', identifier: 'fresh@example.com', code: '246810' },
        'login',
      ),
      400,
      'VERIFICATION_CODE_INVALID',
    );
    await verification.consume(
      { type: 'email', identifier: 'fresh@example.com', code: '246810' },
      'register',
    );
    await expectAuthError(
      verification.consume(
        { type: 'email', identifier: 'fresh@example.com', code: '246810' },
        'register',
      ),
      400,
      'VERIFICATION_CODE_INVALID',
    );

    await verification.send({ type: 'email', identifier: 'tries@example.com', purpose: 'login' });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expectAuthError(
        verification.consume(
          { type: 'email', identifier: 'tries@example.com', code: '000000' },
          'login',
        ),
        400,
        'VERIFICATION_CODE_INVALID',
      );
    }
    await expectAuthError(
      verification.consume(
        { type: 'email', identifier: 'tries@example.com', code: '246810' },
        'login',
      ),
      400,
      'VERIFICATION_CODE_INVALID',
    );
    const burned = repo.codes.find((row) => row.identifier === 'tries@example.com');
    expect(burned?.attemptCount).toBe(5);
    expect(burned?.consumedAt).toBeNull();
    expect(logs.join('\n')).not.toContain('246810');
    expect(logs.join('\n')).not.toContain('000000');
    expect(logs.join('\n')).not.toContain('user@example.com');
  });

  it('同一标识 60 秒内只能发一次，24 小时最多 10 次', async () => {
    const { verification } = createAuthHarness();
    await verification.send({ ...email, purpose: 'register' });
    await expectAuthError(verification.send({ ...email, purpose: 'login' }), 429, 'RATE_LIMITED');

    const limited = 'daily@example.com';
    for (let count = 0; count < 10; count += 1) {
      if (count > 0) vi.advanceTimersByTime(61_000);
      await verification.send({ type: 'email', identifier: limited, purpose: 'login' });
    }
    vi.advanceTimersByTime(61_000);
    await expectAuthError(
      verification.send({ type: 'email', identifier: limited, purpose: 'login' }),
      429,
      'RATE_LIMITED',
    );
  });

  it('生产环境校验成功只告警，不记录验证码', async () => {
    const repo = new MemoryAuthRepository();
    const logs: string[] = [];
    const logger: AuthLogger = {
      info: (fields, message) => logs.push(JSON.stringify({ fields, message })),
      warn: (fields, message) => logs.push(JSON.stringify({ fields, message })),
    };
    const sent: string[] = [];
    const verification = new VerificationService(
      repo,
      testAuthConfig({ nodeEnv: 'production' }),
      { send: async (message) => void sent.push(message.code) },
      logger,
    );
    await verification.send({ ...email, purpose: 'register' });
    await verification.consume({ ...email, code: '246810' }, 'register');
    expect(sent).toEqual(['246810']);
    const text = logs.join('\n');
    expect(text).toContain('静态验证码校验成功');
    expect(text).not.toContain('246810');
    expect(text).not.toContain(email.identifier);
  });
});
