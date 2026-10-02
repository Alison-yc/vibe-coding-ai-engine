import { describe, expect, it } from 'vitest';
import type { AppDatabase } from '../database/pg-vector-store';
import {
  createWorkflowRepository,
  DrizzleWorkflowRepository,
  InMemoryWorkflowRepository,
} from './workflow.repository';

const OWNER = '00000000-0000-4000-8000-0000000000a1';

const graph = {
  nodes: [
    {
      id: 'start',
      type: 'custom-node' as const,
      position: { x: 0, y: 0 },
      data: { type: 'start' as const, config: { fields: [] } },
    },
    {
      id: 'end',
      type: 'custom-node' as const,
      position: { x: 1, y: 0 },
      data: {
        type: 'end' as const,
        config: { outputs: [{ name: 'result', selector: ['start', 'query'] }] },
      },
    },
  ],
  edges: [{ id: 'edge', source: 'start', target: 'end' }],
  viewport: { x: 0, y: 0, zoom: 1 },
};

const workflowRow = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '测试',
  graph,
  version: 1,
  createdAt: new Date('2026-08-27T00:00:00.000Z'),
};

const runRow = {
  id: '00000000-0000-4000-8000-000000000002',
  workflowId: workflowRow.id,
  status: 'running',
  inputs: { query: '你好' },
  outputs: null,
  graphSnapshot: graph,
  error: null,
  startedAt: new Date('2026-08-27T00:00:00.000Z'),
  finishedAt: null,
};

const nodeRunRow = {
  id: '00000000-0000-4000-8000-000000000003',
  runId: runRow.id,
  nodeId: 'start',
  status: 'running',
  inputs: { query: '你好' },
  outputs: null,
  elapsedMs: 0,
  error: null,
  createdAt: new Date('2026-08-27T00:00:00.000Z'),
};

const createChain = (result: unknown) => {
  const promise = Promise.resolve(result);
  const chain = {
    values: () => chain,
    returning: () => Promise.resolve(result),
    from: () => chain,
    innerJoin: () => chain,
    orderBy: () => Promise.resolve(result),
    where: () => chain,
    limit: () => Promise.resolve(result),
    set: () => chain,
    then: promise.then.bind(promise),
  };
  return chain;
};

const mockDb = (results: unknown[]): AppDatabase => {
  const next = () => createChain(results.shift() ?? []);
  return {
    insert: next,
    select: next,
    update: next,
    delete: next,
  } as never;
};

describe('createWorkflowRepository', () => {
  it('根据数据库和环境选择仓储实现', () => {
    expect(createWorkflowRepository(mockDb([]), 'test')).toBeInstanceOf(DrizzleWorkflowRepository);
    expect(createWorkflowRepository(null, 'test')).toBeInstanceOf(InMemoryWorkflowRepository);
    expect(() => createWorkflowRepository(null, 'production')).toThrow('PostgreSQL');
  });
});

describe('InMemoryWorkflowRepository', () => {
  it('保存、更新、列出并删除工作流', async () => {
    const repository = new InMemoryWorkflowRepository();
    const created = await repository.createWorkflow(OWNER, { name: '测试', graph });
    expect(await repository.getWorkflow(OWNER, created.id)).toMatchObject({
      name: '测试',
      version: 1,
    });
    expect(await repository.listWorkflows(OWNER)).toHaveLength(1);
    expect(
      await repository.updateWorkflow(OWNER, created.id, { name: '新版', bumpVersion: true }),
    ).toMatchObject({
      name: '新版',
      version: 2,
    });
    expect(
      await repository.updateWorkflow(OWNER, created.id, { name: '草稿名', bumpVersion: false }),
    ).toMatchObject({
      name: '草稿名',
      version: 2,
    });
    expect(
      await repository.updateWorkflow(OWNER, '00000000-0000-4000-8000-000000000099', {}),
    ).toBeNull();
    await repository.deleteWorkflow(OWNER, created.id);
    expect(await repository.getWorkflow(OWNER, created.id)).toBeNull();
  });

  it('记录工作流和节点运行状态', async () => {
    const repository = new InMemoryWorkflowRepository();
    const workflow = await repository.createWorkflow(OWNER, { name: '测试', graph });
    const run = await repository.createRun(workflow.id, { query: '你好' }, graph);
    const nodeRun = await repository.createNodeRun({
      runId: run.id,
      nodeId: 'start',
      inputs: { query: '你好' },
    });
    await repository.updateNodeRun(nodeRun.id, {
      status: 'completed',
      outputs: { query: '你好' },
      elapsedMs: 3,
    });
    await repository.updateRun(run.id, { status: 'completed', outputs: { result: '你好' } });
    expect(await repository.getRun(OWNER, run.id)).toMatchObject({ status: 'completed' });
    expect(await repository.listRuns(workflow.id)).toHaveLength(1);
    expect(await repository.getRun(OWNER, '00000000-0000-4000-8000-000000000099')).toBeNull();
    expect(await repository.listNodeRuns(run.id)).toMatchObject([
      { nodeId: 'start', status: 'completed', elapsedMs: 3 },
    ]);
    await repository.updateRun('00000000-0000-4000-8000-000000000099', { status: 'failed' });
    await repository.updateNodeRun('00000000-0000-4000-8000-000000000099', {
      status: 'failed',
    });
    await repository.deleteWorkflow(OWNER, workflow.id);
    expect(await repository.listRuns(workflow.id)).toHaveLength(0);
    expect(await repository.listNodeRuns(run.id)).toHaveLength(0);
  });
});

describe('InMemoryWorkflowRepository 归属', () => {
  it('他人的工作流与运行记录一律当作不存在', async () => {
    const repository = new InMemoryWorkflowRepository();
    const intruder = '00000000-0000-4000-8000-0000000000b2';
    const workflow = await repository.createWorkflow(OWNER, { name: '甲', graph });
    const run = await repository.createRun(workflow.id, {}, graph);

    await expect(repository.listWorkflows(intruder)).resolves.toEqual([]);
    await expect(repository.getWorkflow(intruder, workflow.id)).resolves.toBeNull();
    await expect(
      repository.updateWorkflow(intruder, workflow.id, { name: '乙' }),
    ).resolves.toBeNull();
    await expect(repository.getRun(intruder, run.id)).resolves.toBeNull();
    await expect(repository.deleteWorkflow(intruder, workflow.id)).resolves.toBe(false);
    await expect(repository.getWorkflow(OWNER, workflow.id)).resolves.toMatchObject({ name: '甲' });
    await expect(repository.getRun(OWNER, run.id)).resolves.toMatchObject({ id: run.id });
  });
});

describe('DrizzleWorkflowRepository', () => {
  it('映射工作流 CRUD 查询结果', async () => {
    const repository = new DrizzleWorkflowRepository(
      mockDb([
        [workflowRow],
        [workflowRow],
        [workflowRow],
        [workflowRow],
        [{ ...workflowRow, name: '新版', version: 2 }],
        [],
        [workflowRow],
        [],
        [],
      ]),
    );
    await expect(repository.createWorkflow(OWNER, { name: '测试', graph })).resolves.toMatchObject({
      id: workflowRow.id,
    });
    await expect(repository.listWorkflows(OWNER)).resolves.toHaveLength(1);
    await expect(repository.getWorkflow(OWNER, workflowRow.id)).resolves.toMatchObject({
      name: '测试',
    });
    await expect(
      repository.updateWorkflow(OWNER, workflowRow.id, { name: '新版', bumpVersion: true }),
    ).resolves.toMatchObject({ name: '新版', version: 2 });
    await expect(repository.updateWorkflow(OWNER, workflowRow.id, {})).resolves.toBeNull();
    await expect(repository.updateWorkflow(OWNER, workflowRow.id, {})).resolves.toBeNull();
    await repository.deleteWorkflow(OWNER, workflowRow.id);
  });

  it('映射工作流和节点运行记录', async () => {
    const repository = new DrizzleWorkflowRepository(
      mockDb([[runRow], [{ run: runRow }], [runRow], [], [], [nodeRunRow], [nodeRunRow], []]),
    );
    await expect(repository.createRun(workflowRow.id, runRow.inputs, graph)).resolves.toMatchObject(
      { id: runRow.id },
    );
    await expect(repository.getRun(OWNER, runRow.id)).resolves.toMatchObject({ status: 'running' });
    await expect(repository.listRuns(workflowRow.id)).resolves.toHaveLength(1);
    await expect(repository.getRun(OWNER, runRow.id)).resolves.toBeNull();
    await repository.updateRun(runRow.id, { status: 'completed' });
    await expect(
      repository.createNodeRun({
        runId: runRow.id,
        nodeId: 'start',
        inputs: runRow.inputs,
      }),
    ).resolves.toMatchObject({ id: nodeRunRow.id });
    await expect(repository.listNodeRuns(runRow.id)).resolves.toMatchObject([{ nodeId: 'start' }]);
    await repository.updateNodeRun(nodeRunRow.id, { status: 'completed' });
  });

  it('数据库未返回创建行时失败', async () => {
    const repository = new DrizzleWorkflowRepository(mockDb([[], []]));
    await expect(repository.createWorkflow(OWNER, { name: '测试', graph })).rejects.toThrow(
      '创建工作流失败',
    );
    await expect(repository.createRun(workflowRow.id, {}, graph)).rejects.toThrow(
      '创建工作流运行记录失败',
    );
  });

  it('数据库未返回节点运行行时失败', async () => {
    const repository = new DrizzleWorkflowRepository(mockDb([[]]));
    await expect(
      repository.createNodeRun({ runId: runRow.id, nodeId: 'start', inputs: {} }),
    ).rejects.toThrow('创建节点运行记录失败');
  });
});
