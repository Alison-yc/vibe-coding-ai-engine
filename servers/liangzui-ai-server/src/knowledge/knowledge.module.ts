import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import type { AppConfig } from '../config/ollama.config';
import { DRIZZLE } from '../database/database.providers';
import { DatabaseModule } from '../database/database.module';
import type { AppDatabase } from '../database/pg-vector-store';
import { ObservabilityModule } from '../observability/observability.module';
import { IndexingRunner } from './indexing.runner';
import { IndexingScheduler } from './indexing.scheduler';
import { KnowledgeController } from './knowledge.controller';
import { createKnowledgeRepository, KNOWLEDGE_REPOSITORY } from './knowledge.repository';
import { KnowledgeService } from './knowledge.service';

@Module({
  imports: [ConfigModule, DatabaseModule, ObservabilityModule, ScheduleModule.forRoot()],
  controllers: [KnowledgeController],
  providers: [
    {
      provide: KNOWLEDGE_REPOSITORY,
      inject: [DRIZZLE, ConfigService],
      useFactory: (db: AppDatabase | null, config: ConfigService<AppConfig, true>) =>
        createKnowledgeRepository(db, config.get('NODE_ENV', { infer: true })),
    },
    IndexingRunner,
    IndexingScheduler,
    KnowledgeService,
  ],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
