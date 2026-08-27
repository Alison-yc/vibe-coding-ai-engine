import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/ollama.config';
import { ChatModule } from '../chat/chat.module';
import { DRIZZLE } from '../database/database.providers';
import { DatabaseModule } from '../database/database.module';
import type { AppDatabase } from '../database/pg-vector-store';
import { ObservabilityModule } from '../observability/observability.module';
import { AGENT_REPOSITORY, createAgentRepository } from './agent.repository';
import { AgentController } from './agent.controller';
import { AGENT_TOOL_REGISTRY, AgentService } from './agent.service';
import { ApprovalCoordinator } from './approval-coordinator';
import { EditTool } from './tools/edit.tool';
import { GlobTool } from './tools/glob.tool';
import { GrepTool } from './tools/grep.tool';
import { ReadTool } from './tools/read.tool';
import { AgentToolRegistry } from './tools/tool';
import { WriteTool } from './tools/write.tool';

@Module({
  imports: [ConfigModule, DatabaseModule, ChatModule, ObservabilityModule],
  controllers: [AgentController],
  providers: [
    {
      provide: AGENT_REPOSITORY,
      inject: [DRIZZLE, ConfigService],
      useFactory: (db: AppDatabase | null, config: ConfigService<AppConfig, true>) =>
        createAgentRepository(db, config.get('NODE_ENV', { infer: true })),
    },
    {
      provide: AGENT_TOOL_REGISTRY,
      useFactory: () => {
        const registry = new AgentToolRegistry();
        registry.register(new ReadTool());
        registry.register(new WriteTool());
        registry.register(new EditTool());
        registry.register(new GlobTool());
        registry.register(new GrepTool());
        return registry;
      },
    },
    ApprovalCoordinator,
    AgentService,
  ],
})
export class AgentModule {}
