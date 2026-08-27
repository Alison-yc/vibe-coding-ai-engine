import type { WorkflowGraph } from '@ai-engine/contracts';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../src/database/schema';
import { withTransaction } from '../../src/database/with-transaction';
import { DrizzleWorkflowRepository } from '../../src/workflow/workflow.repository';

const databaseUrl = process.env.DATABASE_URL;

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

describe('DrizzleWorkflowRepository integration', () => {
  let pool: Pool;

  beforeAll(() => {
    if (!databaseUrl) throw new Error('集成测试需要 DATABASE_URL');
    pool = new Pool({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('持久化工作流快照、运行状态和节点日志', async () => {
    const db = drizzle(pool, { schema });
    await withTransaction(db, async (tx) => {
      const repository = new DrizzleWorkflowRepository(tx);
      const workflow = await repository.createWorkflow({ name: 'integration', graph });
      const run = await repository.createRun(workflow.id, { query: '你好' }, graph);
      const nodeRun = await repository.createNodeRun({
        runId: run.id,
        nodeId: 'start',
        inputs: { query: '你好' },
      });
      await repository.updateNodeRun(nodeRun.id, {
        status: 'completed',
        outputs: { query: '你好' },
        elapsedMs: 2,
      });
      await repository.updateRun(run.id, {
        status: 'completed',
        outputs: { answer: '你好' },
        finishedAt: new Date(),
      });

      await expect(repository.listRuns(workflow.id)).resolves.toMatchObject([
        {
          id: run.id,
          status: 'completed',
          graphSnapshot: graph,
          outputs: { answer: '你好' },
          finishedAt: expect.any(Date),
        },
      ]);
      await expect(repository.listNodeRuns(run.id)).resolves.toMatchObject([
        { nodeId: 'start', status: 'completed', elapsedMs: 2 },
      ]);
      return true;
    });
  });
});
