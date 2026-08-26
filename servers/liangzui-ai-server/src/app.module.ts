import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LlmController } from './llm/llm.controller';

@Module({
  imports: [],
  controllers: [AppController, LlmController],
  providers: [AppService],
})
export class AppModule {}
