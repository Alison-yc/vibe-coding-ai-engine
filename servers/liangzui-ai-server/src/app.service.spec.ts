import { beforeEach, describe, expect, it } from 'vitest';
import { EMBEDDING_DIMENSION } from '@ai-engine/contracts';
import { AppService } from './app.service';
import { InMemoryVectorStore } from './database/in-memory-vector-store';
import { FakeLlmGateway } from './llm/fake-llm-gateway';
import { OllamaUnreachableError } from './llm/llm-errors';

const embedding = (hotIndex = 0): number[] =>
  Array.from({ length: EMBEDDING_DIMENSION }, (_, index) => (index === hotIndex ? 1 : 0));

describe('AppService', () => {
  let gateway: FakeLlmGateway;
  let service: AppService;

  beforeEach(() => {
    gateway = new FakeLlmGateway();
    service = new AppService(gateway, new InMemoryVectorStore());
  });

  it('返回基础问候与 prompt 文本', () => {
    expect(service.getHello()).toBe('Hello World!');
    expect(service.prompt('Cursor')).toBe('Hello, Cursor!');
  });

  it('返回翻译与 RAG 基础实现的结果', async () => {
    gateway.enqueueText('Hello');
    gateway.enqueueEmbeddings([
      embedding(0),
      embedding(1),
      embedding(2),
      embedding(3),
      embedding(4),
    ]);
    gateway.enqueueEmbeddings([embedding(0)]);
    gateway.enqueueText('北京');

    await expect(service.translate('你好')).resolves.toBe('Hello');
    await expect(service.ragQuery('我住哪')).resolves.toBe('北京');
  });

  it('保留翻译失败的错误信息', async () => {
    gateway.enqueueError(new Error('connection refused'));

    await expect(service.translate('你好')).rejects.toThrow('connection refused');
  });

  it('透传网关错误以便过滤器映射状态码', async () => {
    gateway.enqueueError(new OllamaUnreachableError('http://127.0.0.1:11434'));

    await expect(service.translate('你好')).rejects.toBeInstanceOf(OllamaUnreachableError);
  });

  it('为非 Error 的翻译失败提供稳定兜底信息', async () => {
    gateway.enqueueError('failed');

    await expect(service.translate('你好')).rejects.toThrow('Ollama request failed');
  });

  it('保留 RAG 失败的错误信息', async () => {
    gateway.setEmbeddings([]);

    await expect(service.ragQuery('我住哪')).rejects.toThrow('预置了 0 个向量');
  });

  it('为非 Error 的 RAG 失败提供稳定兜底信息', async () => {
    gateway.enqueueEmbeddings([
      embedding(0),
      embedding(0),
      embedding(0),
      embedding(0),
      embedding(0),
    ]);
    gateway.enqueueEmbeddings([embedding(0)]);
    gateway.enqueueError('failed');

    await expect(service.ragQuery('我住哪')).rejects.toThrow('Ollama request failed');
  });
});
