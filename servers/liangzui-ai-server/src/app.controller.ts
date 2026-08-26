import { Controller, Get, Inject, Query } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @Get('prompt')
  prompt(@Query('message') message: string): string {
    return this.appService.prompt(message);
  }

  @Get('translate')
  async translate(@Query('text') text: string): Promise<string> {
    return await this.appService.translate(text);
  }

  @Get('rag-query')
  async ragQuery(@Query('q') q: string): Promise<string> {
    return await this.appService.ragQuery(q);
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
