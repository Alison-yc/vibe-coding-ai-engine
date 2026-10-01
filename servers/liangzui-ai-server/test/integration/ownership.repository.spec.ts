import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleAuthRepository } from '../../src/auth/auth.repository';
import { DrizzleChatRepository } from '../../src/chat/chat.repository';
import * as schema from '../../src/database/schema';
import type { AppDatabase } from '../../src/database/pg-vector-store';

const databaseUrl = process.env.DATABASE_URL;

class Rollback extends Error {}

const createUsers = async (db: AppDatabase) => {
  const auth = new DrizzleAuthRepository(db);
  const owner = await auth.insertUser({ kind: 'registered' });
  const intruder = await auth.insertUser({ kind: 'registered' });
  return { owner: owner.id, intruder: intruder.id };
};

/** 用例整体跑在事务里，结束时回滚，不污染开发库。 */
const inRolledBackTransaction = async (
  pool: Pool,
  run: Parameters<AppDatabase['transaction']>[0],
): Promise<void> => {
  await expect(
    drizzle(pool, { schema }).transaction(async (tx) => {
      await run(tx);
      throw new Rollback();
    }),
  ).rejects.toBeInstanceOf(Rollback);
};

describe('资源归属（PostgreSQL）', () => {
  let pool: Pool;

  beforeAll(() => {
    if (!databaseUrl) throw new Error('集成测试需要 DATABASE_URL');
    pool = new Pool({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('对话会话：他人读、改、删都当作不存在，无主会话对任何人不可见', async () => {
    await inRolledBackTransaction(pool, async (tx) => {
      const db = tx as unknown as AppDatabase;
      const { owner, intruder } = await createUsers(db);
      const repository = new DrizzleChatRepository(db);
      const session = await repository.createSession(owner, {
        title: '甲',
        modelId: 'qwen3.5:2b',
        datasetIds: [],
      });
      const orphan = await db
        .insert(schema.chatSessions)
        .values({ title: '无主', agentType: 'chat', modelId: 'qwen3.5:2b', datasetIds: [] })
        .returning();

      expect((await repository.listSessions(owner)).map((item) => item.id)).toEqual([session.id]);
      await expect(repository.listSessions(intruder)).resolves.toEqual([]);
      await expect(repository.getSession(intruder, session.id)).resolves.toBeNull();
      await expect(
        repository.updateSession(intruder, session.id, { title: '乙' }),
      ).resolves.toBeNull();
      await expect(repository.deleteSession(intruder, session.id)).resolves.toBe(false);
      await expect(repository.getSession(owner, session.id)).resolves.toMatchObject({
        title: '甲',
      });
      await expect(repository.getSession(owner, orphan[0]!.id)).resolves.toBeNull();
      await expect(repository.deleteSession(owner, session.id)).resolves.toBe(true);
    });
  });
});
