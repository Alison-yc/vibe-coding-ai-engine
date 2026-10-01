import { Controller, Get, Inject, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { RequirePermissions } from './auth/access-policy';

@Controller()
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @RequirePermissions('chat:tools')
  @Get('prompt')
  prompt(@Query('message') message: string): string {
    return this.appService.prompt(message);
  }

  @RequirePermissions('chat:tools')
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
