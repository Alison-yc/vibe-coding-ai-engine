import type { WorkflowGraph } from '@ai-engine/contracts';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleAuthRepository } from '../../src/auth/auth.repository';
import { DrizzleChatRepository } from '../../src/chat/chat.repository';
import * as schema from '../../src/database/schema';
import type { AppDatabase } from '../../src/database/pg-vector-store';
import { DrizzleWorkflowRepository } from '../../src/workflow/workflow.repository';
import { DrizzleKnowledgeRepository } from '../../src/knowledge/knowledge.repository';

const databaseUrl = process.env.DATABASE_URL;

class Rollback extends Error {}

const graph: WorkflowGraph = {
  nodes: [
    {
      id: 'start',
      type: 'custom-node',
      position: { x: 0, y: 0 },
      data: { type: 'start', config: { fields: [] } },
    },
    {
      id: 'end',
      type: 'custom-node',
      position: { x: 1, y: 0 },
      data: { type: 'end', config: { outputs: [] } },
    },
  ],
  edges: [{ id: 'edge', source: 'start', target: 'end' }],
  viewport: { x: 0, y: 0, zoom: 1 },
};

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

  it('工作流与运行记录：他人读、改、删、查运行都当作不存在', async () => {
    await inRolledBackTransaction(pool, async (tx) => {
      const db = tx as unknown as AppDatabase;
      const { owner, intruder } = await createUsers(db);
      const repository = new DrizzleWorkflowRepository(db);
      const workflow = await repository.createWorkflow(owner, { name: '甲', graph });
      const run = await repository.createRun(workflow.id, {}, graph);

      await expect(repository.listWorkflows(intruder)).resolves.toEqual([]);
      await expect(repository.getWorkflow(intruder, workflow.id)).resolves.toBeNull();
      await expect(
        repository.updateWorkflow(intruder, workflow.id, { name: '乙' }),
      ).resolves.toBeNull();
      await expect(repository.getRun(intruder, run.id)).resolves.toBeNull();
      await expect(repository.deleteWorkflow(intruder, workflow.id)).resolves.toBe(false);
      await expect(repository.getRun(owner, run.id)).resolves.toMatchObject({ id: run.id });
      await expect(repository.getWorkflow(owner, workflow.id)).resolves.toMatchObject({
        name: '甲',
      });
    });
  });

  it('知识库与文档：他人读、删都当作不存在，系统流程仍能读到', async () => {
    await inRolledBackTransaction(pool, async (tx) => {
      const db = tx as unknown as AppDatabase;
      const { owner, intruder } = await createUsers(db);
      const repository = new DrizzleKnowledgeRepository(db);
      const dataset = await repository.createDataset(owner, '甲', 'nomic-embed-text:latest', {
        strategy: 'recursive',
        chunkSize: 500,
        overlap: 50,
      });
      const document = await repository.createDocument({
        datasetId: dataset.id,
        name: 'a.md',
        sourceType: 'paste',
        extractedText: '北京',
      });

      await expect(repository.listDatasets(intruder)).resolves.toEqual([]);
      await expect(repository.getDataset(intruder, dataset.id)).resolves.toBeNull();
      await expect(repository.getDocument(intruder, document.id)).resolves.toBeNull();
      await expect(repository.deleteDataset(intruder, dataset.id)).resolves.toBe(false);
      await expect(repository.getDocument(owner, document.id)).resolves.toMatchObject({
        name: 'a.md',
      });
      await expect(repository.getDocumentForSystem(document.id)).resolves.toMatchObject({
        name: 'a.md',
      });
      await expect(repository.listDatasets(owner)).resolves.toHaveLength(1);
      await expect(repository.deleteDataset(owner, dataset.id)).resolves.toBe(true);
    });
  });
});
