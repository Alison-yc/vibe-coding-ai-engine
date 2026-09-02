import { createMemoryKeyValueStore, type Platform } from '@ai-engine/platform';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BackendConnectionError,
  checkBackendConnection,
  localizeBackendConnectionError,
  normalizeApiBaseUrl,
  persistApiBaseUrl,
} from './backend-connection';

const platform = {
  kv: createMemoryKeyValueStore(),
} as Platform;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('backend connection', () => {
  it('规范化本机地址并拒绝非本机目标', () => {
    expect(normalizeApiBaseUrl(' http://localhost:3100/ ')).toBe('http://localhost:3100');
    expect(normalizeApiBaseUrl('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
    expect(() => normalizeApiBaseUrl('https://localhost:3000')).toThrow('http');
    expect(() => normalizeApiBaseUrl('http://192.168.1.2:3000')).toThrow('localhost');
    expect(() => normalizeApiBaseUrl('not-a-url')).toThrow('有效');
  });

  it('按稳定错误码本地化地址校验错误', () => {
    const error = new BackendConnectionError('hostNotAllowed', 'raw');
    expect(localizeBackendConnectionError(error, (key) => `translated:${key}`)).toBe(
      'translated:connectionErrors.hostNotAllowed',
    );
    expect(localizeBackendConnectionError(new Error('offline'), (key) => key)).toBe('offline');
  });

  it('健康检查通过契约校验并持久化地址', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ok',
          chatModel: 'qwen3.5:2b',
          embeddingModel: 'nomic-embed-text',
          numCtx: 4096,
          numPredict: 1024,
          temperature: 0.2,
          vectorStore: 'postgres',
        }),
      }),
    );

    await expect(checkBackendConnection('http://localhost:3000')).resolves.toMatchObject({
      status: 'ok',
    });
    await expect(persistApiBaseUrl(platform, 'http://localhost:3100/')).resolves.toBe(
      'http://localhost:3100',
    );
    await expect(platform.kv.get('api.baseUrl')).resolves.toBe('http://localhost:3100');
  });

  it('健康检查非成功响应时拒绝连接', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(checkBackendConnection('http://localhost:3000')).rejects.toThrow('503');
  });
});
