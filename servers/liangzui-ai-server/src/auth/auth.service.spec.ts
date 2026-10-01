import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAuthHarness,
  expectAuthError,
  FakePasswordHasher,
  testAuthConfig,
  testMeta,
} from './auth-test-kit';
import { AuthService } from './auth.service';
import { SessionTokenService } from './session-token';
import { StaticVerificationCodeSender } from './verification-code-sender';
import { VerificationService } from './verification.service';

const password = 'correct-horse';
const code = '246810';
const email = 'user@example.com';

describe('AuthService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-02T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('访客升级注册后可以退出、密码登录、验证码登录并重置密码', async () => {
    const { auth, repo, logs, tokens } = createAuthHarness();
    repo.orphans.push({ ownerId: null });
    const guest = await auth.issueGuest({ ...testMeta(), userAgent: 'u'.repeat(300) });
    expect(guest.user.roles).toEqual(['guest']);
    expect(guest.user.permissions).toEqual(['chat:basic', 'chat:model-switch']);
    expect(repo.sessions[0]?.userAgent).toHaveLength(256);
    expect(repo.sessions[0]?.tokenHash).toBe(tokens.hash(guest.token));
    expect(repo.sessions[0]?.tokenHash).not.toContain(guest.token);

    const again = await auth.issueGuest({ ...testMeta(), token: guest.token });
    expect(again.user.id).toBe(guest.user.id);
    expect(again.token).toBe(guest.token);
    expect(repo.users).toHaveLength(1);

    await auth.sendCode({ type: 'email', identifier: email, purpose: 'register' });
    const registered = await auth.register(
      { type: 'email', identifier: email, password, code, displayName: '甲' },
      { ...testMeta(), token: guest.token },
    );
    expect(registered.user.id).toBe(guest.user.id);
    expect(registered.user.kind).toBe('registered');
    expect(registered.user.roles).toEqual(['user', 'admin']);
    expect(registered.token).not.toBe(guest.token);
    expect(repo.orphans[0]?.ownerId).toBe(registered.user.id);
    await expectAuthError(auth.authenticate(guest.token), 401, 'UNAUTHORIZED');

    const me = await auth.me(await auth.authenticate(registered.token));
    expect(me.identities).toEqual([
      expect.objectContaining({ type: 'email', identifier: 'u***@example.com' }),
    ]);
    expect(JSON.stringify(me)).not.toContain(email);

    await auth.logout(await auth.authenticate(registered.token));
    await expectAuthError(auth.authenticate(registered.token), 401, 'UNAUTHORIZED');

    const byPassword = await auth.loginWithPassword(
      { type: 'email', identifier: email, password },
      testMeta(),
    );
    vi.advanceTimersByTime(61_000);
    await auth.sendCode({ type: 'email', identifier: email, purpose: 'login' });
    const byCode = await auth.loginWithCode({ type: 'email', identifier: email, code }, testMeta());

    vi.advanceTimersByTime(61_000);
    await auth.sendCode({ type: 'email', identifier: email, purpose: 'reset_password' });
    await auth.resetPassword({
      type: 'email',
      identifier: email,
      code,
      password: 'new-password-2',
    });
    await expectAuthError(auth.authenticate(byPassword.token), 401, 'UNAUTHORIZED');
    await expectAuthError(auth.authenticate(byCode.token), 401, 'UNAUTHORIZED');
    const restored = await auth.loginWithPassword(
      { type: 'email', identifier: email, password: 'new-password-2' },
      testMeta(),
    );
    expect(restored.user.id).toBe(guest.user.id);

    repo.orphans.push({ ownerId: null });
    vi.advanceTimersByTime(61_000);
    await auth.sendCode({ type: 'email', identifier: 'other@example.com', purpose: 'register' });
    const second = await auth.register(
      { type: 'email', identifier: 'other@example.com', password, code },
      testMeta(),
    );
    expect(second.user.roles).toEqual(['user']);
    expect(repo.orphans[1]?.ownerId).toBeNull();

    const text = logs.join('\n');
    expect(text).not.toContain(password);
    expect(text).not.toContain('new-password-2');
    expect(text).not.toContain(code);
    expect(text).not.toContain(email);
    expect(text).not.toContain(registered.token);
    expect(text).not.toContain(restored.token);
    expect(repo.users.every((user) => !user.passwordHash?.includes(password))).toBe(true);
    expect(repo.users.every((user) => !user.passwordHash?.includes('new-password-2'))).toBe(true);
  });

  it('密码连续失败 5 次后锁定 15 分钟，不存在的账号也会做一次假哈希', async () => {
    const { auth, passwords } = createAuthHarness();
    await auth.sendCode({ type: 'email', identifier: email, purpose: 'register' });
    await auth.register({ type: 'email', identifier: email, password, code }, testMeta());
    await expectAuthError(
      auth.loginWithPassword(
        { type: 'email', identifier: 'missing@example.com', password },
        testMeta(),
      ),
      401,
      'INVALID_CREDENTIALS',
    );
    expect(passwords.dummyCalls).toBe(1);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expectAuthError(
        auth.loginWithPassword(
          { type: 'email', identifier: email, password: 'wrong-password-1' },
          testMeta(),
        ),
        401,
        'INVALID_CREDENTIALS',
      );
    }
    await expectAuthError(
      auth.loginWithPassword({ type: 'email', identifier: email, password }, testMeta()),
      429,
      'RATE_LIMITED',
    );
    vi.advanceTimersByTime(15 * 60 * 1000 + 5_000);
    const unlocked = await auth.loginWithPassword(
      { type: 'email', identifier: email, password },
      testMeta(),
    );
    expect(unlocked.user.id).toBeTruthy();
  });

  it('会话过期、注销和停用账号都不能继续使用 token', async () => {
    const { auth, repo } = createAuthHarness();
    const guest = await auth.issueGuest(testMeta());
    const session = repo.sessions[0];
    if (!session) throw new Error('缺少会话');
    const expiry = session.expiresAt.getTime();
    const seen = session.lastSeenAt.getTime();
    vi.advanceTimersByTime(6 * 60 * 1000);
    await auth.authenticate(guest.token);
    expect(repo.sessions[0]?.expiresAt.getTime()).toBe(expiry);
    expect(repo.sessions[0]?.lastSeenAt.getTime()).toBeGreaterThan(seen);

    await repo.touchSession(session.id, {
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() - 1000),
    });
    await expectAuthError(auth.authenticate(guest.token), 401, 'UNAUTHORIZED');

    const active = await auth.issueGuest(testMeta());
    await auth.logout(await auth.authenticate(active.token));
    await expectAuthError(auth.authenticate(active.token), 401, 'UNAUTHORIZED');

    const disabled = await auth.issueGuest(testMeta());
    await repo.updateUser(disabled.user.id, { status: 'disabled' });
    await expectAuthError(auth.authenticate(disabled.token), 403, 'FORBIDDEN');
  });

  it('注册时携带已注销的访客 token，按新用户注册且不浪费验证码', async () => {
    const { auth } = createAuthHarness();
    const guest = await auth.issueGuest(testMeta());
    await auth.logout(await auth.authenticate(guest.token));
    await auth.sendCode({ type: 'email', identifier: email, purpose: 'register' });
    const registered = await auth.register(
      { type: 'email', identifier: email, password, code },
      { ...testMeta(), token: guest.token },
    );
    expect(registered.user.id).not.toBe(guest.user.id);
    expect(registered.user.kind).toBe('registered');
  });

  it('注册用户超过 5 分钟后续期，标识冲突映射为 IDENTIFIER_TAKEN', async () => {
    const { auth, repo, tokens } = createAuthHarness();
    await auth.sendCode({ type: 'email', identifier: email, purpose: 'register' });
    const registered = await auth.register(
      { type: 'email', identifier: email, password, code },
      testMeta(),
    );
    const session = repo.sessions.find((row) => row.tokenHash === tokens.hash(registered.token));
    const originalExpiry = session?.expiresAt.getTime();
    vi.advanceTimersByTime(6 * 60 * 1000);
    await auth.authenticate(registered.token);
    const slid = repo.sessions.find((row) => row.tokenHash === tokens.hash(registered.token));
    expect(slid?.expiresAt.getTime()).toBeGreaterThan(originalExpiry ?? 0);

    repo.failIdentityOnce = true;
    vi.advanceTimersByTime(61_000);
    await auth.sendCode({ type: 'email', identifier: 'race@example.com', purpose: 'register' });
    await expectAuthError(
      auth.register({ type: 'email', identifier: 'race@example.com', password, code }, testMeta()),
      409,
      'IDENTIFIER_TAKEN',
    );
  });

  it('没有数据库时认证接口返回 503', async () => {
    const config = testAuthConfig();
    const logger = { info: () => undefined, warn: () => undefined };
    const auth = new AuthService(
      null,
      new FakePasswordHasher() as unknown as ConstructorParameters<typeof AuthService>[1],
      new SessionTokenService(),
      new VerificationService(null, config, new StaticVerificationCodeSender(), logger),
      config,
      logger,
    );
    await expect(auth.issueGuest(testMeta())).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
