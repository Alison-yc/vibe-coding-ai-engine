import { describe, expect, it, vi } from 'vitest';

const fundamentals = vi.hoisted(() => ({
  ragQuery: vi.fn(),
  translate: vi.fn(),
}));

vi.mock('./fundamentals/rag', () => ({ ragQuery: fundamentals.ragQuery }));
vi.mock('./fundamentals/translate', () => ({ translate: fundamentals.translate }));

import { AppService } from './app.service';

describe('AppService', () => {
  const service = new AppService();

  it('返回基础问候与 prompt 文本', () => {
    expect(service.getHello()).toBe('Hello World!');
    expect(service.prompt('Cursor')).toBe('Hello, Cursor!');
  });

  it('返回翻译与 RAG 基础实现的结果', async () => {
    fundamentals.translate.mockResolvedValueOnce('Hello');
    fundamentals.ragQuery.mockResolvedValueOnce('北京');

    await expect(service.translate('你好')).resolves.toBe('Hello');
    await expect(service.ragQuery('我住哪')).resolves.toBe('北京');
  });

  it('保留翻译失败的错误信息', async () => {
    fundamentals.translate.mockRejectedValueOnce(new Error('connection refused'));

    await expect(service.translate('你好')).rejects.toThrow('connection refused');
  });

  it('为非 Error 的翻译失败提供稳定兜底信息', async () => {
    fundamentals.translate.mockRejectedValueOnce('failed');

    await expect(service.translate('你好')).rejects.toThrow('Ollama request failed');
  });

  it('保留 RAG 失败的错误信息', async () => {
    fundamentals.ragQuery.mockRejectedValueOnce(new Error('connection refused'));

    await expect(service.ragQuery('我住哪')).rejects.toThrow('connection refused');
  });

  it('为非 Error 的 RAG 失败提供稳定兜底信息', async () => {
    fundamentals.ragQuery.mockRejectedValueOnce('failed');

    await expect(service.ragQuery('我住哪')).rejects.toThrow('Ollama request failed');
  });
});
