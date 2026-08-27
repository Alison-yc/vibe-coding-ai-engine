import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { validateEnvironment } from './config/ollama.config';
import { ChatModule } from './chat/chat.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { LlmController } from './llm/llm.controller';
import { ObservabilityModule } from './observability/observability.module';
import { TraceIdModule } from './observability/trace-id.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnvironment,
    }),
    TraceIdModule,
    ObservabilityModule,
    DatabaseModule,
    KnowledgeModule,
    ChatModule,
  ],
  controllers: [AppController, LlmController],
  providers: [AppService],
})
export class AppModule {}
