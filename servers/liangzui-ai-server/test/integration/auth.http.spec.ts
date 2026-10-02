import { createHash, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { hashIdentifier } from '../../src/auth/identifier-hash';
import type { AppDatabase } from '../../src/database/pg-vector-store';
import { AuthController } from '../../src/auth/auth.controller';
import { AUTH_GLOBAL_GUARDS } from '../../src/auth/global-guards';
import { AuthService } from '../../src/auth/auth.service';
import { DrizzleAuthRepository } from '../../src/auth/auth.repository';
import { PasswordHasher } from '../../src/auth/password-hasher';
import { SessionTokenService } from '../../src/auth/session-token';
import { StaticVerificationCodeSender } from '../../src/auth/verification-code-sender';
import type { AuthLogger } from '../../src/auth/verification.service';
import { VerificationService } from '../../src/auth/verification.service';
import * as schema from '../../src/database/schema';
import {
  authEvents,
  authSessions,
  chatSessions,
  datasets,
  roles,
  userIdentities,
  userRoles,
  users,
  verificationCodes,
  workflows,
} from '../../src/database/schema';

const databaseUrl = process.env.DATABASE_URL;
const code = '246810';
const password = 'correct-horse';
const nextPassword = 'new-password-2';

describe('认证 HTTP 集成', () => {
  let pool: Pool;
  let db: AppDatabase;
  let app: INestApplication;
  const logs: string[] = [];
  const identifiers = new Set<string>();
  const userIds = new Set<string>();
  const extraChatIds: string[] = [];
  let baseline: {
    chats: Array<{ id: string; ownerId: string | null }>;
    datasets: Array<{ id: string; ownerId: string | null }>;
    workflows: Array<{ id: string; ownerId: string | null }>;
  };

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('集成测试需要 DATABASE_URL');
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });
    baseline = {
      chats: await db
        .select({ id: chatSessions.id, ownerId: chatSessions.ownerId })
        .from(chatSessions),
      datasets: await db.select({ id: datasets.id, ownerId: datasets.ownerId }).from(datasets),
      workflows: await db.select({ id: workflows.id, ownerId: workflows.ownerId }).from(workflows),
    };
    const logger: AuthLogger = {
      info: (fields, message) => logs.push(JSON.stringify({ fields, message })),
      warn: (fields, message) => logs.push(JSON.stringify({ fields, message })),
    };
    const config = {
      verificationMode: 'static' as const,
      staticCode: code,
      sessionTtlDays: 7,
      guestTtlDays: 30,
      nodeEnv: 'test' as const,
    };
    const repo = new DrizzleAuthRepository(db);
    const verification = new VerificationService(
      repo,
      config,
      new StaticVerificationCodeSender(),
      logger,
    );
    const auth = new AuthService(
      repo,
      new PasswordHasher(),
      new SessionTokenService(),
      verification,
      config,
      logger,
    );
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: auth }, ...AUTH_GLOBAL_GUARDS],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
  }, 30_000);

  afterEach(async () => {
    if (!db || !baseline) return;
    for (const row of baseline.chats) {
      await db
        .update(chatSessions)
        .set({ ownerId: row.ownerId })
        .where(eq(chatSessions.id, row.id));
    }
    for (const row of baseline.datasets) {
      await db.update(datasets).set({ ownerId: row.ownerId }).where(eq(datasets.id, row.id));
    }
    for (const row of baseline.workflows) {
      await db.update(workflows).set({ ownerId: row.ownerId }).where(eq(workflows.id, row.id));
    }
    const emails = [...identifiers];
    const identityRows =
      emails.length === 0
        ? []
        : await db
            .select({ userId: userIdentities.userId })
            .from(userIdentities)
            .where(inArray(userIdentities.identifier, emails));
    const ids = [...new Set([...userIds, ...identityRows.map((row) => row.userId)])];
    if (ids.length > 0) await db.delete(users).where(inArray(users.id, ids));
    if (emails.length > 0) {
      await db.delete(verificationCodes).where(inArray(verificationCodes.identifier, emails));
      await db
        .delete(authEvents)
        .where(inArray(authEvents.identifierHash, emails.map(hashIdentifier)));
    }
    if (extraChatIds.length > 0) {
      await db.delete(chatSessions).where(inArray(chatSessions.id, extraChatIds));
      extraChatIds.length = 0;
    }
    identifiers.clear();
    userIds.clear();
    logs.length = 0;
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  const http = () => request(app.getHttpServer());

  it('用 HTTP 走通访客、注册、me、退出、两种登录和重置密码', async () => {
    const email = `flow-${randomUUID()}@example.com`;
    identifiers.add(email);
    const remember = (body: { user?: { id?: string } }) => {
      if (body.user?.id) userIds.add(body.user.id);
    };

    const guest = await http().post('/auth/guest').set('x-client', 'web').expect(200);
    remember(guest.body);
    const limited = await http()
      .post('/auth/verification-codes')
      .send({ type: 'email', identifier: email, purpose: 'register' });
    expect(limited.status).toBe(200);
    const again = await http()
      .post('/auth/verification-codes')
      .send({ type: 'email', identifier: email, purpose: 'login' });
    expect(again.status).toBe(429);
    expect(again.body.code).toBe('RATE_LIMITED');
    await db
      .update(verificationCodes)
      .set({ createdAt: new Date(Date.now() - 120_000) })
      .where(eq(verificationCodes.identifier, email));

    const registered = await http()
      .post('/auth/register')
      .set('authorization', `Bearer ${guest.body.token}`)
      .send({ type: 'email', identifier: email, password, code, displayName: '甲' })
      .expect(200);
    expect(registered.body.user.id).toBe(guest.body.user.id);
    expect(registered.body.user.roles).toEqual(expect.arrayContaining(['user']));

    const me = await http()
      .get('/auth/me')
      .set('authorization', `Bearer ${registered.body.token}`)
      .expect(200);
    expect(me.body.identities[0].identifier).toBe(`${email.slice(0, 1)}***@example.com`);
    expect(JSON.stringify(me.body)).not.toContain(email);

    await http()
      .post('/auth/logout')
      .set('authorization', `Bearer ${registered.body.token}`)
      .expect(204);
    await http()
      .get('/auth/me')
      .set('authorization', `Bearer ${registered.body.token}`)
      .expect(401);

    const byPassword = await http()
      .post('/auth/login/password')
      .send({ type: 'email', identifier: email, password })
      .expect(200);

    await db
      .update(verificationCodes)
      .set({ createdAt: new Date(Date.now() - 120_000) })
      .where(eq(verificationCodes.identifier, email));
    await http()
      .post('/auth/verification-codes')
      .send({ type: 'email', identifier: email, purpose: 'login' })
      .expect(200);
    const byCode = await http()
      .post('/auth/login/code')
      .send({ type: 'email', identifier: email, code })
      .expect(200);

    await db
      .update(verificationCodes)
      .set({ createdAt: new Date(Date.now() - 120_000) })
      .where(eq(verificationCodes.identifier, email));
    await http()
      .post('/auth/verification-codes')
      .send({ type: 'email', identifier: email, purpose: 'reset_password' })
      .expect(200);
    await http()
      .post('/auth/password-resets')
      .send({ type: 'email', identifier: email, code, password: nextPassword })
      .expect(204);
    await http()
      .get('/auth/me')
      .set('authorization', `Bearer ${byPassword.body.token}`)
      .expect(401);
    await http().get('/auth/me').set('authorization', `Bearer ${byCode.body.token}`).expect(401);
    const restored = await http()
      .post('/auth/login/password')
      .send({ type: 'email', identifier: email, password: nextPassword })
      .expect(200);
    expect(restored.body.user.id).toBe(guest.body.user.id);

    const [user] = await db.select().from(users).where(eq(users.id, restored.body.user.id));
    expect(user?.passwordHash?.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(user?.passwordHash).not.toContain(password);
    expect(user?.passwordHash).not.toContain(nextPassword);
    const sessions = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.userId, restored.body.user.id));
    const token = restored.body.token as string;
    expect(sessions.some((row) => row.tokenHash === token)).toBe(false);
    expect(
      sessions.some((row) => row.tokenHash === createHash('sha256').update(token).digest('hex')),
    ).toBe(true);
    const storedCodes = await db
      .select()
      .from(verificationCodes)
      .where(eq(verificationCodes.identifier, email));
    expect(storedCodes.every((row) => !Object.values(row).includes(code))).toBe(true);
    const text = logs.join('\n');
    expect(text).not.toContain(password);
    expect(text).not.toContain(nextPassword);
    expect(text).not.toContain(code);
    expect(text).not.toContain(email);
    expect(text).not.toContain(token);
    expect(text).not.toContain(guest.body.token);
  }, 60_000);

  it('并发猜码不会越过 5 次上限，用尽后正确验证码也失效', async () => {
    const email = `burst-${randomUUID()}@example.com`;
    identifiers.add(email);
    await http()
      .post('/auth/verification-codes')
      .send({ type: 'email', identifier: email, purpose: 'login' })
      .expect(200);
    const [issued] = await db
      .select()
      .from(verificationCodes)
      .where(eq(verificationCodes.identifier, email));
    if (!issued) throw new Error('缺少验证码记录');
    const repo = new DrizzleAuthRepository(db);
    const results = await Promise.all(
      Array.from({ length: 12 }, () => repo.incrementCodeAttempt(issued.id, 5)),
    );
    expect(results.filter(Boolean)).toHaveLength(5);
    const [row] = await db
      .select()
      .from(verificationCodes)
      .where(eq(verificationCodes.id, issued.id));
    expect(row?.attemptCount).toBe(5);
    await http()
      .post('/auth/login/code')
      .send({ type: 'email', identifier: email, code })
      .expect(400);
  }, 30_000);

  it('并发注册只产生一个管理员，并只由该管理员认领无主数据', async () => {
    const before = await countAdmins();
    const emailA = `race-a-${randomUUID()}@example.com`;
    const emailB = `race-b-${randomUUID()}@example.com`;
    identifiers.add(emailA);
    identifiers.add(emailB);
    const [orphan] = await db
      .insert(chatSessions)
      .values({ title: 'auth2-orphan', agentType: 'chat', modelId: 'qwen3.5:2b' })
      .returning();
    if (!orphan) throw new Error('无法写入无主会话');
    extraChatIds.push(orphan.id);

    await http()
      .post('/auth/verification-codes')
      .send({ type: 'email', identifier: emailA, purpose: 'register' })
      .expect(200);
    await http()
      .post('/auth/verification-codes')
      .send({ type: 'email', identifier: emailB, purpose: 'register' })
      .expect(200);
    const [first, second] = await Promise.all([
      http().post('/auth/register').send({ type: 'email', identifier: emailA, password, code }),
      http().post('/auth/register').send({ type: 'email', identifier: emailB, password, code }),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    if (typeof first.body.user?.id === 'string') userIds.add(first.body.user.id);
    if (typeof second.body.user?.id === 'string') userIds.add(second.body.user.id);
    const created = [first.body.user.id as string, second.body.user.id as string];
    let createdAdmins = 0;
    for (const userId of created) {
      if (await isAdmin(userId)) createdAdmins += 1;
    }
    expect(createdAdmins).toBe(before === 0 ? 1 : 0);
    expect(await countAdmins()).toBe(before === 0 ? 1 : before);

    const [owned] = await db.select().from(chatSessions).where(eq(chatSessions.id, orphan.id));
    if (before === 0) expect(created).toContain(owned?.ownerId);
    else expect(owned?.ownerId).toBeNull();
  }, 60_000);

  const countAdmins = async (): Promise<number> => {
    const rows = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(roles.key, 'admin'));
    return rows.length;
  };

  const isAdmin = async (userId: string): Promise<boolean> => {
    const [row] = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(userRoles.userId, userId), eq(roles.key, 'admin')))
      .limit(1);
    return Boolean(row);
  };

  it('清理只删过期会话与长期未活动的访客，注册用户与近期访客保留', async () => {
    const day = 24 * 60 * 60 * 1000;
    const now = new Date();
    const old = new Date(now.getTime() - 40 * day);
    await expect(
      db.transaction(async (tx) => {
        const repo = new DrizzleAuthRepository(tx);
        const stale = await repo.insertUser({ kind: 'guest' });
        const fresh = await repo.insertUser({ kind: 'guest' });
        const registered = await repo.insertUser({ kind: 'registered' });
        await repo.insertSession({
          userId: stale.id,
          tokenHash: randomUUID(),
          client: 'web',
          expiresAt: old,
        });
        await tx
          .update(authSessions)
          .set({ lastSeenAt: old })
          .where(eq(authSessions.userId, stale.id));
        await repo.insertSession({
          userId: fresh.id,
          tokenHash: randomUUID(),
          client: 'web',
          expiresAt: new Date(now.getTime() + 30 * day),
        });

        expect(await repo.deleteExpiredSessions(now)).toBeGreaterThanOrEqual(1);
        expect(
          await repo.deleteStaleGuests(new Date(now.getTime() - 30 * day)),
        ).toBeGreaterThanOrEqual(1);
        const left = await tx
          .select({ id: users.id })
          .from(users)
          .where(inArray(users.id, [stale.id, fresh.id, registered.id]));
        expect(left.map((row) => row.id).sort()).toEqual([fresh.id, registered.id].sort());
        throw new Error('rollback-cleanup-probe');
      }),
    ).rejects.toThrow('rollback-cleanup-probe');
  });

  it('列出自己的登录设备，注销他人设备返回 404', async () => {
    const email = `devices-${randomUUID()}@example.com`;
    identifiers.add(email);
    const guest = await http().post('/auth/guest').set('x-client', 'web').expect(200);
    userIds.add(guest.body.user.id);
    await db
      .update(verificationCodes)
      .set({ createdAt: new Date(Date.now() - 120_000) })
      .where(eq(verificationCodes.identifier, email));
    await http()
      .post('/auth/verification-codes')
      .send({ type: 'email', identifier: email, purpose: 'register' })
      .expect(200);
    const registered = await http()
      .post('/auth/register')
      .set('authorization', `Bearer ${guest.body.token}`)
      .set('x-client', 'web')
      .send({ type: 'email', identifier: email, password, code })
      .expect(200);
    expect(registered.body.token).not.toBe(guest.body.token);
    const second = await http()
      .post('/auth/login/password')
      .set('x-client', 'desktop')
      .send({ type: 'email', identifier: email, password })
      .expect(200);

    const listed = await http()
      .get('/auth/sessions')
      .set('authorization', `Bearer ${second.body.token}`)
      .expect(200);
    expect(listed.body.sessions).toHaveLength(2);
    expect(JSON.stringify(listed.body)).not.toContain(second.body.token);
    const current = listed.body.sessions.find((row: { current: boolean }) => row.current);
    const other = listed.body.sessions.find((row: { current: boolean }) => !row.current);
    expect(current.client).toBe('desktop');

    await http()
      .delete(`/auth/sessions/${other.id}`)
      .set('authorization', `Bearer ${second.body.token}`)
      .expect(200);
    const intruder = await http().post('/auth/guest').set('x-client', 'web').expect(200);
    userIds.add(intruder.body.user.id);
    await http()
      .delete(`/auth/sessions/${current.id}`)
      .set('authorization', `Bearer ${intruder.body.token}`)
      .expect(404);
  });
});
