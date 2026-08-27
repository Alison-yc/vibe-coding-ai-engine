import { describe, expect, it } from 'vitest';
import type { AppDatabase } from '../database/pg-vector-store';
import {
  createWorkflowRepository,
  DrizzleWorkflowRepository,
  InMemoryWorkflowRepository,
} from './workflow.repository';

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
    const created = await repository.createWorkflow({ name: '测试', graph });
    expect(await repository.getWorkflow(created.id)).toMatchObject({ name: '测试', version: 1 });
    expect(await repository.listWorkflows()).toHaveLength(1);
    expect(await repository.updateWorkflow(created.id, { name: '新版' })).toMatchObject({
      name: '新版',
      version: 2,
    });
    expect(await repository.updateWorkflow('00000000-0000-4000-8000-000000000099', {})).toBeNull();
    await repository.deleteWorkflow(created.id);
    expect(await repository.getWorkflow(created.id)).toBeNull();
  });

  it('记录工作流和节点运行状态', async () => {
    const repository = new InMemoryWorkflowRepository();
    const workflow = await repository.createWorkflow({ name: '测试', graph });
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
    expect(await repository.getRun(run.id)).toMatchObject({ status: 'completed' });
    expect(await repository.listRuns(workflow.id)).toHaveLength(1);
    expect(await repository.getRun('00000000-0000-4000-8000-000000000099')).toBeNull();
    expect(await repository.listNodeRuns(run.id)).toMatchObject([
      { nodeId: 'start', status: 'completed', elapsedMs: 3 },
    ]);
    await repository.updateRun('00000000-0000-4000-8000-000000000099', { status: 'failed' });
    await repository.updateNodeRun('00000000-0000-4000-8000-000000000099', {
      status: 'failed',
    });
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
    await expect(repository.createWorkflow({ name: '测试', graph })).resolves.toMatchObject({
      id: workflowRow.id,
    });
    await expect(repository.listWorkflows()).resolves.toHaveLength(1);
    await expect(repository.getWorkflow(workflowRow.id)).resolves.toMatchObject({ name: '测试' });
    await expect(
      repository.updateWorkflow(workflowRow.id, { name: '新版' }),
    ).resolves.toMatchObject({ name: '新版', version: 2 });
    await expect(repository.updateWorkflow(workflowRow.id, {})).resolves.toBeNull();
    await expect(repository.updateWorkflow(workflowRow.id, {})).resolves.toBeNull();
    await repository.deleteWorkflow(workflowRow.id);
  });

  it('映射工作流和节点运行记录', async () => {
    const repository = new DrizzleWorkflowRepository(
      mockDb([[runRow], [runRow], [runRow], [], [], [nodeRunRow], [nodeRunRow], []]),
    );
    await expect(repository.createRun(workflowRow.id, runRow.inputs, graph)).resolves.toMatchObject(
      { id: runRow.id },
    );
    await expect(repository.getRun(runRow.id)).resolves.toMatchObject({ status: 'running' });
    await expect(repository.listRuns(workflowRow.id)).resolves.toHaveLength(1);
    await expect(repository.getRun(runRow.id)).resolves.toBeNull();
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
    await expect(repository.createWorkflow({ name: '测试', graph })).rejects.toThrow(
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
