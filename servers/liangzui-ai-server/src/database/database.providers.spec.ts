import { describe, expect, it } from 'vitest';
import { shouldUsePostgres } from './database.providers';

describe('shouldUsePostgres', () => {
  it('测试环境默认不连真实数据库', () => {
    expect(
      shouldUsePostgres({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://ai_engine:ai_engine_dev_only@localhost:5432/ai_engine',
        RUN_DB_INTEGRATION: false,
      }),
    ).toBe(false);
  });

  it('集成测试开关打开时连 Postgres', () => {
    expect(
      shouldUsePostgres({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://ai_engine:ai_engine_dev_only@localhost:5432/ai_engine',
        RUN_DB_INTEGRATION: true,
      }),
    ).toBe(true);
  });

  it('生产环境缺少 DATABASE_URL 时拒绝启动', () => {
    expect(() => shouldUsePostgres({ NODE_ENV: 'production', RUN_DB_INTEGRATION: false })).toThrow(
      '生产环境必须配置 DATABASE_URL',
    );
  });
});
