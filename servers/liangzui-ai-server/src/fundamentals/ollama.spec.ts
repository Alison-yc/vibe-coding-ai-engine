import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChatOllama, createOllamaEmbeddings } from './ollama';

describe('Ollama 客户端工厂', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('使用默认本地配置', () => {
    vi.stubEnv('OLLAMA_BASE_URL', undefined);
    vi.stubEnv('OLLAMA_MODEL', undefined);
    vi.stubEnv('OLLAMA_EMBED_MODEL', undefined);

    expect(createChatOllama()).toMatchObject({
      baseUrl: 'http://127.0.0.1:11434',
      model: 'qwen3.5:2b',
      numCtx: 2048,
      numPredict: 128,
    });
    expect(createOllamaEmbeddings()).toMatchObject({
      baseUrl: 'http://127.0.0.1:11434',
      model: 'nomic-embed-text:latest',
    });
  });

  it('使用环境变量覆盖模型与地址', () => {
    vi.stubEnv('OLLAMA_BASE_URL', 'http://localhost:11434');
    vi.stubEnv('OLLAMA_MODEL', 'local-chat');
    vi.stubEnv('OLLAMA_EMBED_MODEL', 'local-embed');

    expect(createChatOllama()).toMatchObject({
      baseUrl: 'http://localhost:11434',
      model: 'local-chat',
    });
    expect(createOllamaEmbeddings()).toMatchObject({
      baseUrl: 'http://localhost:11434',
      model: 'local-embed',
    });
  });
});
