import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './ollama.config';

describe('Ollama 配置', () => {
  it('提供来自基线报告的默认参数', () => {
    expect(validateEnvironment({})).toMatchObject({
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
      OLLAMA_MODEL: 'qwen3.5:2b',
      OLLAMA_EMBED_MODEL: 'nomic-embed-text:latest',
      OLLAMA_NUM_CTX: 8192,
      OLLAMA_NUM_PREDICT: 2048,
      OLLAMA_TEMPERATURE: 0.2,
    });
  });

  it('转换环境变量数值并拒绝非法地址', () => {
    expect(
      validateEnvironment({
        OLLAMA_BASE_URL: 'http://localhost:11434',
        OLLAMA_NUM_CTX: '4096',
        OLLAMA_NUM_PREDICT: '512',
      }),
    ).toMatchObject({ OLLAMA_NUM_CTX: 4096, OLLAMA_NUM_PREDICT: 512 });
    expect(() => validateEnvironment({ OLLAMA_BASE_URL: 'not-a-url' })).toThrow();
  });

  it('允许用空 DATABASE_URL 显式启用内存回退', () => {
    expect(validateEnvironment({ DATABASE_URL: '' }).DATABASE_URL).toBeUndefined();
  });

  it('校验 sidecar 端口、父进程与迁移目录', () => {
    expect(
      validateEnvironment({
        SERVER_PORT: '43121',
        SIDECAR_MODE: 'true',
        SIDECAR_PARENT_PID: '1234',
        DATABASE_MIGRATIONS_PATH: '/tmp/migrations',
        MCP_NPX_CLI_PATH: '/app/node_modules/npm/bin/npx-cli.js',
      }),
    ).toMatchObject({
      SERVER_PORT: 43121,
      SIDECAR_MODE: true,
      SIDECAR_PARENT_PID: 1234,
      DATABASE_MIGRATIONS_PATH: '/tmp/migrations',
      MCP_NPX_CLI_PATH: '/app/node_modules/npm/bin/npx-cli.js',
    });
    expect(validateEnvironment({ SERVER_PORT: '0', SIDECAR_MODE: 'true' }).SERVER_PORT).toBe(0);
    expect(() => validateEnvironment({ SERVER_PORT: '70000' })).toThrow();
  });
});
