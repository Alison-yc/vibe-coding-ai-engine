import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleAuthRepository, type AuthUserKind } from '../../src/auth/auth.repository';
import * as schema from '../../src/database/schema';
import { chatSessions, userIdentities } from '../../src/database/schema';
import { withTransaction } from '../../src/database/with-transaction';

const databaseUrl = process.env.DATABASE_URL;

describe('DrizzleAuthRepository integration', () => {
  let pool: Pool;

  beforeAll(() => {
    if (!databaseUrl) throw new Error('集成测试需要 DATABASE_URL');
    pool = new Pool({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('迁移预置 guest、user、admin 三种角色', async () => {
    const repository = new DrizzleAuthRepository(drizzle(pool, { schema }));
    const keys = (await repository.listRoles()).map((role) => role.key).sort();
    expect(keys).toEqual(['admin', 'guest', 'user']);
  });

  it('CHECK 拒绝非法 kind', async () => {
    const db = drizzle(pool, { schema });
    await expect(
      db.transaction(async (tx) => {
        await new DrizzleAuthRepository(tx).insertUser({ kind: 'robot' as AuthUserKind });
      }),
    ).rejects.toThrow();
  });

  it('唯一约束拒绝同一类型的重复标识', async () => {
    const db = drizzle(pool, { schema });
    await expect(
      db.transaction(async (tx) => {
        const repository = new DrizzleAuthRepository(tx);
        const user = await repository.insertUser({ kind: 'guest' });
        await repository.insertIdentity({
          userId: user.id,
          type: 'email',
          identifier: 'dup@example.com',
        });
        await repository.insertIdentity({
          userId: user.id,
          type: 'email',
          identifier: 'dup@example.com',
        });
      }),
    ).rejects.toThrow();
  });

  it('复合主键拒绝重复授角', async () => {
    const db = drizzle(pool, { schema });
    await expect(
      db.transaction(async (tx) => {
        const repository = new DrizzleAuthRepository(tx);
        const user = await repository.insertUser({ kind: 'registered' });
        await repository.grantRole(user.id, 'user');
        await repository.grantRole(user.id, 'user');
      }),
    ).rejects.toThrow();
  });

  it('删除用户级联标识和会话，并把审计 user_id 置空', async () => {
    const db = drizzle(pool, { schema });
    await withTransaction(db, async (tx) => {
      const repository = new DrizzleAuthRepository(tx);
      const user = await repository.insertUser({ kind: 'registered', displayName: '甲' });
      await repository.insertIdentity({
        userId: user.id,
        type: 'phone',
        identifier: '+8613800138000',
      });
      await repository.insertSession({
        userId: user.id,
        tokenHash: `hash-${user.id}`,
        client: 'desktop',
        expiresAt: new Date(Date.now() + 60_000),
      });
      const event = await repository.insertEvent({ userId: user.id, type: 'register' });
      const [chat] = await tx
        .insert(chatSessions)
        .values({
          ownerId: user.id,
          title: '隔离',
          agentType: 'chat',
          modelId: 'qwen3.5:2b',
        })
        .returning();
      if (!chat) throw new Error('写入会话失败');

      await repository.deleteUser(user.id);
      await expect(repository.findEvent(event.id)).resolves.toMatchObject({ userId: null });
      const identities = await tx
        .select()
        .from(userIdentities)
        .where(eq(userIdentities.userId, user.id));
      expect(identities).toEqual([]);
      const chats = await tx.select().from(chatSessions).where(eq(chatSessions.id, chat.id));
      expect(chats).toEqual([]);
      return true;
    });
  });
});
