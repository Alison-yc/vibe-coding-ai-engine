import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AppService } from './app.service';
import { abortOnClientClose } from './http/abort-on-client-close';

@Controller()
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @Get('prompt')
  prompt(@Query('message') message: string): string {
    return this.appService.prompt(message);
  }

  @Get('rag-query')
  async ragQuery(@Req() request: Request, @Query('q') q: string): Promise<string> {
    return await this.appService.ragQuery(q, abortOnClientClose(request));
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
