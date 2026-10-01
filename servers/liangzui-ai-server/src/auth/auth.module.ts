import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/ollama.config';
import { DRIZZLE } from '../database/database.providers';
import { DatabaseModule } from '../database/database.module';
import type { AppDatabase } from '../database/pg-vector-store';
import { AUTH_CONFIG, readAuthRuntimeConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AUTH_REPOSITORY, DrizzleAuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { PasswordHasher } from './password-hasher';
import { SessionTokenService } from './session-token';
import { StaticVerificationCodeSender, VERIFICATION_CODE_SENDER } from './verification-code-sender';
import { VerificationService } from './verification.service';

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [AuthController],
  providers: [
    PasswordHasher,
    SessionTokenService,
    StaticVerificationCodeSender,
    {
      provide: VERIFICATION_CODE_SENDER,
      useExisting: StaticVerificationCodeSender,
    },
    {
      provide: AUTH_REPOSITORY,
      inject: [DRIZZLE],
      useFactory: (db: AppDatabase | null) => (db ? new DrizzleAuthRepository(db) : null),
    },
    {
      provide: AUTH_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => readAuthRuntimeConfig(config),
    },
    VerificationService,
    AuthService,
    AuthGuard,
  ],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
