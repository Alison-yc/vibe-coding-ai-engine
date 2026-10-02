import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthService } from './auth.service';

@Injectable()
export class AuthCleanupScheduler {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<void> {
    await this.auth.cleanupExpired();
  }
}
