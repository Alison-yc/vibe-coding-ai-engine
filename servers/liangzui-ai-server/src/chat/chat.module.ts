import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/ollama.config';
import { DRIZZLE } from '../database/database.providers';
import { DatabaseModule } from '../database/database.module';
import type { AppDatabase } from '../database/pg-vector-store';
import { AgentModule } from '../agent/agent.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { ObservabilityModule } from '../observability/observability.module';
import { ChatController } from './chat.controller';
import { createChatRepository, CHAT_REPOSITORY } from './chat.repository';
import { ChatService } from './chat.service';
import { ModelsController } from './models.controller';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    ObservabilityModule,
    KnowledgeModule,
    forwardRef(() => AgentModule),
  ],
  controllers: [ChatController, ModelsController],
  providers: [
    {
      provide: CHAT_REPOSITORY,
      inject: [DRIZZLE, ConfigService],
      useFactory: (db: AppDatabase | null, config: ConfigService<AppConfig, true>) =>
        createChatRepository(db, config.get('NODE_ENV', { infer: true })),
    },
    ChatService,
  ],
  exports: [CHAT_REPOSITORY, ChatService],
})
export class ChatModule {}
