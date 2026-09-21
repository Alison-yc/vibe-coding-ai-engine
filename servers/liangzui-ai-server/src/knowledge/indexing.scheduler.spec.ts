import { describe, expect, it, vi } from 'vitest';
import { IndexingScheduler } from './indexing.scheduler';

describe('IndexingScheduler', () => {
  it('拉取 pending 文档并交给 runner', async () => {
    const repository = {
      listPendingDocumentIds: vi.fn().mockResolvedValue(['00000000-0000-4000-8000-000000000001']),
    };
    const indexing = { run: vi.fn().mockResolvedValue(undefined) };
    const scheduler = new IndexingScheduler(repository as never, indexing as never);
    await scheduler.drainPending();
    expect(indexing.run).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
  });

  it('没有 pending 时不调用 runner', async () => {
    const repository = { listPendingDocumentIds: vi.fn().mockResolvedValue([]) };
    const indexing = { run: vi.fn() };
    const scheduler = new IndexingScheduler(repository as never, indexing as never);
    await scheduler.drainPending();
    expect(indexing.run).not.toHaveBeenCalled();
  });
});
