import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { validateEnvironment } from './config/ollama.config';
import { LLM_GATEWAY } from './llm/llm-gateway';
import { LlmController } from './llm/llm.controller';
import { OllamaLlmGateway } from './llm/ollama-llm-gateway';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnvironment,
    }),
    DatabaseModule,
  ],
  controllers: [AppController, LlmController],
  providers: [
    AppService,
    {
      provide: LLM_GATEWAY,
      useClass: OllamaLlmGateway,
    },
  ],
})
export class AppModule {}
