import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { Pool } from 'pg';
import type { AppConfig } from '../config/ollama.config';
import {
  assertEmbeddingDimensionMatchesContract,
  readEmbeddingColumnType,
} from './embedding-dimension';
import type { AppDatabase } from './pg-vector-store';

export const DRIZZLE = Symbol('DRIZZLE');
export const PG_POOL = Symbol('PG_POOL');

export const shouldUsePostgres = (config: {
  NODE_ENV: 'development' | 'test' | 'production';
  DATABASE_URL?: string;
  RUN_DB_INTEGRATION: boolean;
}): boolean => {
  if (config.NODE_ENV === 'production' && !config.DATABASE_URL) {
    throw new Error('生产环境必须配置 DATABASE_URL');
  }
  if (config.RUN_DB_INTEGRATION) return Boolean(config.DATABASE_URL);
  if (config.NODE_ENV === 'test') return false;
  return Boolean(config.DATABASE_URL);
};

@Injectable()
export class DatabaseLifecycle implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseLifecycle.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: AppDatabase | null,
    @Inject(PG_POOL) private readonly pool: Pool | null,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.db) {
      if (this.config.get('NODE_ENV', { infer: true }) !== 'test') {
        this.logger.warn({
          operation: 'postgres-skipped',
          reason: '未连接 PostgreSQL，向量存储走内存实现',
        });
      }
      return;
    }
    if (this.config.get('SIDECAR_MODE', { infer: true })) {
      const migrationsFolder = path.resolve(
        this.config.get('DATABASE_MIGRATIONS_PATH', { infer: true }),
      );
      await migrate(this.db, { migrationsFolder });
      this.logger.log({ operation: 'sidecar-migrations-complete', migrationsFolder });
    }
    const columnType = await readEmbeddingColumnType(this.db);
    assertEmbeddingDimensionMatchesContract(columnType);
    this.logger.debug({ operation: 'embedding-dimension-check', columnType });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
