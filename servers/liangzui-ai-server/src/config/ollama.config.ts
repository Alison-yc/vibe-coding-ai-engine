import { z } from 'zod';

/** 端口与 `.plan/01` 约定一致：Web Vite、Tauri Vite、Tauri 打包后的页面来源。 */
const DEFAULT_CORS_ORIGINS = 'http://localhost:5173,http://localhost:1420,tauri://localhost';
/** 只接受完整来源（协议 + 主机 + 可选端口），拒绝 `*` 与带路径的写法。 */
const CORS_ORIGIN_PATTERN = /^(https?|tauri):\/\/[a-z0-9.-]+(:\d{1,5})?$/i;

const EnvironmentSchema = z.object({
  OLLAMA_BASE_URL: z.string().url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().min(1).default('qwen3.5:2b'),
  OLLAMA_MODEL_LARGE: z.string().min(1).default('gemma4:e2b'),
  OLLAMA_EMBED_MODEL: z.string().min(1).default('nomic-embed-text:latest'),
  // 8192：大海捞针三位置召回 1.0、热延迟约 3.4s。见 2026-08-26 基线 context/latency。
  OLLAMA_NUM_CTX: z.coerce.number().int().positive().default(8192),
  // 2048：替换拍脑袋的 128；本轮未测截断拐点，取 .env.example 上限。
  OLLAMA_NUM_PREDICT: z.coerce.number().int().positive().default(2048),
  OLLAMA_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  OLLAMA_KEEP_ALIVE: z.string().min(1).default('10m'),
  SERVER_PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url().optional(),
  ),
  AUTH_VERIFICATION_MODE: z.enum(['static']).default('static'),
  AUTH_STATIC_VERIFICATION_CODE: z
    .string()
    .regex(/^\d{6}$/)
    .default('246810'),
  AUTH_SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  AUTH_GUEST_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGINS: z
    .string()
    .default(DEFAULT_CORS_ORIGINS)
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().regex(CORS_ORIGIN_PATTERN)).min(1)),
  OLLAMA_EMBED_BATCH_SIZE: z.coerce.number().int().min(1).max(128).default(32),
  RUN_DB_INTEGRATION: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  AGENT_WORKSPACE_ROOTS: z.string().default(''),
  AGENT_MAX_STEPS: z.coerce.number().int().min(2).max(12).default(6),
  MCP_CONFIG_PATH: z.string().min(1).default('mcp.json'),
  MCP_NPX_CLI_PATH: z.string().min(1).optional(),
  SIDECAR_MODE: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  SIDECAR_PARENT_PID: z.coerce.number().int().positive().optional(),
  DATABASE_MIGRATIONS_PATH: z.string().min(1).default('drizzle'),
});

export type AppConfig = z.infer<typeof EnvironmentSchema>;

export const validateEnvironment = (environment: Record<string, unknown>): AppConfig =>
  EnvironmentSchema.parse(environment);

export const readOllamaConfig = (): AppConfig => validateEnvironment(process.env);
