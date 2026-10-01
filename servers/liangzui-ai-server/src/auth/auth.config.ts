import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/ollama.config';

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export type AuthRuntimeConfig = {
  verificationMode: 'static';
  staticCode: string;
  sessionTtlDays: number;
  guestTtlDays: number;
  nodeEnv: 'development' | 'test' | 'production';
};

export const readAuthRuntimeConfig = (
  config: ConfigService<AppConfig, true>,
): AuthRuntimeConfig => ({
  verificationMode: config.get('AUTH_VERIFICATION_MODE', { infer: true }),
  staticCode: config.get('AUTH_STATIC_VERIFICATION_CODE', { infer: true }),
  sessionTtlDays: config.get('AUTH_SESSION_TTL_DAYS', { infer: true }),
  guestTtlDays: config.get('AUTH_GUEST_TTL_DAYS', { infer: true }),
  nodeEnv: config.get('NODE_ENV', { infer: true }),
});
