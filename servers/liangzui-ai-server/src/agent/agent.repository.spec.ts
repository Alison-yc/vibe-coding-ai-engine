import { describe, expect, it } from 'vitest';
import {
  createAgentRepository,
  DrizzleAgentRepository,
  InMemoryAgentRepository,
} from './agent.repository';

describe('AgentRepository durable inbox', () => {
  it('输入按 queued → processing → completed 流转且先标记 delivery', async () => {
    const repository = new InMemoryAgentRepository();
    const queued = await repository.enqueueInput({
      sessionId: crypto.randomUUID(),
      content: '读取文件',
      workspaceRoot: '/workspace',
      mode: 'edit',
    });
    expect(queued).toEqual(expect.objectContaining({ delivery: 'pending', status: 'queued' }));
    await expect(repository.listQueuedInputs()).resolves.toEqual([queued]);
    const claimed = await repository.claimInput(queued.id);
    expect(claimed).toEqual(
      expect.objectContaining({ delivery: 'promoted', status: 'processing' }),
    );
    await repository.completeInput(queued.id, 'completed');
    await expect(repository.claimInput(queued.id)).resolves.toBeNull();
    await expect(repository.listQueuedInputs()).resolves.toEqual([]);
    await repository.completeInput(crypto.randomUUID(), 'error');
  });

  it('恢复时把处理中输入标记为错误', async () => {
    const repository = new InMemoryAgentRepository();
    const queued = await repository.enqueueInput({
      sessionId: crypto.randomUUID(),
      content: '读取文件',
      workspaceRoot: '/workspace',
      mode: 'edit',
    });
    await repository.claimInput(queued.id);
    await repository.recoverInterruptedInputs();
    await expect(repository.claimInput(queued.id)).resolves.toBeNull();
  });

  it('持久化本会话允许规则', async () => {
    const repository = new InMemoryAgentRepository();
    const sessionId = crypto.randomUUID();
    await repository.addSessionPermission(sessionId, 'write', 'README.md');
    await expect(repository.listPermissionRules(sessionId)).resolves.toEqual([
      { tool: 'write', resource: 'README.md', effect: 'allow' },
    ]);
  });

  it('Drizzle 实现持久化 inbox 状态与会话权限', async () => {
    const now = new Date();
    const inputRow = {
      id: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      content: '读取',
      workspaceRoot: '/workspace',
      mode: 'edit',
      delivery: 'pending',
      status: 'queued',
      createdAt: now,
    };
    const returningResults = [
      [inputRow],
      [{ ...inputRow, delivery: 'promoted', status: 'processing' }],
    ];
    const permissionRows = [
      {
        id: crypto.randomUUID(),
        sessionId: inputRow.sessionId,
        tool: 'write',
        resource: 'README.md',
        effect: 'allow',
        createdAt: now,
      },
    ];
    const chain = {
      insert: () => chain,
      update: () => chain,
      select: () => chain,
      values: () => chain,
      set: () => chain,
      where: () => chain,
      from: () => chain,
      returning: () => Promise.resolve(returningResults.shift() ?? []),
      orderBy: () => Promise.resolve(permissionRows),
    };
    const repository = new DrizzleAgentRepository(chain as never);
    const queued = await repository.enqueueInput({
      sessionId: inputRow.sessionId,
      content: '读取',
      workspaceRoot: '/workspace',
      mode: 'edit',
    });
    expect(queued.status).toBe('queued');
    await expect(repository.claimInput(queued.id)).resolves.toEqual(
      expect.objectContaining({ status: 'processing' }),
    );
    await repository.completeInput(queued.id, 'completed');
    await repository.recoverInterruptedInputs();
    await expect(repository.listPermissionRules(inputRow.sessionId)).resolves.toEqual([
      { tool: 'write', resource: 'README.md', effect: 'allow' },
    ]);
    await repository.addSessionPermission(inputRow.sessionId, 'write', 'README.md');
  });

  it('仓储工厂在测试或无数据库时使用内存实现', () => {
    expect(createAgentRepository(null, 'production')).toBeInstanceOf(InMemoryAgentRepository);
    expect(createAgentRepository({} as never, 'test')).toBeInstanceOf(InMemoryAgentRepository);
    expect(createAgentRepository({} as never, 'production')).toBeInstanceOf(DrizzleAgentRepository);
  });

  it('Drizzle 没有返回写入行时给出明确结果', async () => {
    const chain = {
      insert: () => chain,
      update: () => chain,
      values: () => chain,
      set: () => chain,
      where: () => chain,
      returning: () => Promise.resolve([]),
    };
    const repository = new DrizzleAgentRepository(chain as never);
    await expect(
      repository.enqueueInput({
        sessionId: crypto.randomUUID(),
        content: '读取',
        workspaceRoot: '/workspace',
        mode: 'edit',
      }),
    ).rejects.toThrow('入队失败');
    await expect(repository.claimInput(crypto.randomUUID())).resolves.toBeNull();
  });
});
