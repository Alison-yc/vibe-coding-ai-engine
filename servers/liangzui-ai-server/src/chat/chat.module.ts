import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/ollama.config';
import { DRIZZLE } from '../database/database.providers';
import { DatabaseModule } from '../database/database.module';
import type { AppDatabase } from '../database/pg-vector-store';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { ObservabilityModule } from '../observability/observability.module';
import { ChatController } from './chat.controller';
import { createChatRepository, CHAT_REPOSITORY } from './chat.repository';
import { ChatService } from './chat.service';

@Module({
  imports: [ConfigModule, DatabaseModule, ObservabilityModule, KnowledgeModule],
  controllers: [ChatController],
  providers: [
    {
      provide: CHAT_REPOSITORY,
      inject: [DRIZZLE, ConfigService],
      useFactory: (db: AppDatabase | null, config: ConfigService<AppConfig, true>) =>
        createChatRepository(db, config.get('NODE_ENV', { infer: true })),
    },
    ChatService,
  ],
})
export class ChatModule {}
