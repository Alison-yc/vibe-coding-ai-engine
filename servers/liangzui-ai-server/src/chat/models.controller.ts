import { Controller, Get, Inject } from '@nestjs/common';
import { ChatModelCatalogResponseSchema } from '@ai-engine/contracts';
import { ChatService } from './chat.service';

@Controller('models')
export class ModelsController {
  constructor(@Inject(ChatService) private readonly chat: ChatService) {}

  @Get()
  async listModels() {
    return ChatModelCatalogResponseSchema.parse({ models: await this.chat.listModels() });
  }
}
