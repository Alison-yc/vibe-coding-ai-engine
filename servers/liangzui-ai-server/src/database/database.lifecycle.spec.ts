import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseLifecycle } from './database.providers';
import type { AppDatabase } from './pg-vector-store';

const configOf = (nodeEnv: 'development' | 'test' | 'production') =>
  ({ get: () => nodeEnv }) as never;

describe('DatabaseLifecycle', () => {
  it('测试环境没有数据库连接时静默跳过维度自检', async () => {
    const lifecycle = new DatabaseLifecycle(null, null, configOf('test'));
    await expect(lifecycle.onModuleInit()).resolves.toBeUndefined();
    await expect(lifecycle.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('开发环境未连接数据库时记录告警', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const lifecycle = new DatabaseLifecycle(null, null, configOf('development'));
    await lifecycle.onModuleInit();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('列类型为 vector(768) 时通过自检', async () => {
    const db = {
      execute: vi.fn().mockResolvedValue({ rows: [{ col_type: 'vector(768)' }] }),
    } as unknown as AppDatabase;
    const pool = { end: vi.fn().mockResolvedValue(undefined) };
    const lifecycle = new DatabaseLifecycle(db, pool as never, configOf('test'));
    await lifecycle.onModuleInit();
    await lifecycle.onModuleDestroy();
    expect(pool.end).toHaveBeenCalled();
  });

  it('列类型为 vector(512) 时拒绝启动', async () => {
    const db = {
      execute: vi.fn().mockResolvedValue({ rows: [{ col_type: 'vector(512)' }] }),
    } as unknown as AppDatabase;
    const lifecycle = new DatabaseLifecycle(db, null, configOf('test'));
    await expect(lifecycle.onModuleInit()).rejects.toThrow('向量维度不匹配');
  });
});
