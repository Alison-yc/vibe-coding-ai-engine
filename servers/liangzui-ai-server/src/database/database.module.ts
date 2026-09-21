import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { AppConfig } from '../config/ollama.config';
import { DatabaseLifecycle, DRIZZLE, PG_POOL, shouldUsePostgres } from './database.providers';
import { InMemoryVectorStore } from './in-memory-vector-store';
import { PgVectorStore, type AppDatabase } from './pg-vector-store';
import * as schema from './schema';
import { VECTOR_STORE } from './vector-store';

@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>): Pool | null => {
        const usePostgres = shouldUsePostgres({
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
          DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
          RUN_DB_INTEGRATION: config.get('RUN_DB_INTEGRATION', { infer: true }),
        });
        if (!usePostgres) return null;
        const connectionString = config.get('DATABASE_URL', { infer: true });
        if (!connectionString) {
          throw new Error('DATABASE_URL 缺失');
        }
        return new Pool({ connectionString });
      },
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null): AppDatabase | null =>
        pool ? drizzle(pool, { schema }) : null,
    },
    {
      provide: VECTOR_STORE,
      inject: [DRIZZLE],
      useFactory: (db: AppDatabase | null) =>
        db ? new PgVectorStore(db) : new InMemoryVectorStore(),
    },
    DatabaseLifecycle,
  ],
  exports: [VECTOR_STORE, DRIZZLE],
})
export class DatabaseModule {}
