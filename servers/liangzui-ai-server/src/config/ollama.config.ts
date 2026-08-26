import { z } from 'zod';

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
});

export type AppConfig = z.infer<typeof EnvironmentSchema>;

export const validateEnvironment = (environment: Record<string, unknown>): AppConfig =>
  EnvironmentSchema.parse(environment);

export const readOllamaConfig = (): AppConfig => validateEnvironment(process.env);
