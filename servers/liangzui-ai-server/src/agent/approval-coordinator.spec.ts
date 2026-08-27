import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApprovalCoordinator } from './approval-coordinator';

afterEach(() => vi.useRealTimers());

describe('ApprovalCoordinator', () => {
  it('拒绝其他会话绕过审批', async () => {
    const coordinator = new ApprovalCoordinator();
    const sessionId = crypto.randomUUID();
    const approval = coordinator.create({
      sessionId,
      toolCallId: 'call-1',
      tool: 'write',
      resource: 'README.md',
      diff: '+new',
    });
    const waiting = coordinator.wait(approval, new AbortController().signal, () => undefined);
    expect(coordinator.respond(crypto.randomUUID(), approval.id, 'allow-once')).toBe(false);
    expect(coordinator.respond(sessionId, approval.id, 'deny')).toBe(true);
    await expect(waiting).resolves.toBe('deny');
    expect(coordinator.respond(sessionId, approval.id, 'allow-once')).toBe(false);
  });

  it('五分钟没有响应时按拒绝处理', async () => {
    vi.useFakeTimers();
    const coordinator = new ApprovalCoordinator();
    const approval = coordinator.create({
      sessionId: crypto.randomUUID(),
      toolCallId: 'call-timeout',
      tool: 'edit',
      resource: 'README.md',
    });
    const waiting = coordinator.wait(approval, new AbortController().signal, () => undefined);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await expect(waiting).resolves.toBe('deny');
  });
});
