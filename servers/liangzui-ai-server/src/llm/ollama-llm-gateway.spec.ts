import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/ollama.config';
import { LlmTimeoutError, ModelNotFoundError, OllamaUnreachableError } from './llm-errors';
import { OllamaLlmGateway } from './ollama-llm-gateway';

const REQUEST = {
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  content: '你好',
};

const createGateway = () =>
  new OllamaLlmGateway(
    new ConfigService<AppConfig, true>({
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
      OLLAMA_MODEL: 'qwen3.5:2b',
      OLLAMA_MODEL_LARGE: 'gemma4:e2b',
      OLLAMA_EMBED_MODEL: 'nomic-embed-text:latest',
      OLLAMA_NUM_CTX: 8192,
      OLLAMA_NUM_PREDICT: 2048,
      OLLAMA_TEMPERATURE: 0.2,
      OLLAMA_KEEP_ALIVE: '10m',
    }),
  );

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('OllamaLlmGateway', () => {
  it('把非流式响应转换为共享 ChatResponse 契约', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          message: { content: '你好，我能帮你什么？' },
          prompt_eval_count: 8,
          eval_count: 12,
        }),
      ),
    );

    const response = await createGateway().chat(REQUEST);
    expect(response.message.sessionId).toBe(REQUEST.sessionId);
    expect(response.message.parts[0]).toMatchObject({
      type: 'text',
      text: '你好，我能帮你什么？',
    });
  });

  it('连接失败只重试两次并返回可操作提示', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    const assertion = expect(createGateway().chat(REQUEST)).rejects.toBeInstanceOf(
      OllamaUnreachableError,
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('把模型不存在与上下文溢出分类', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: 'model not found' }, { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({ error: 'context length exceeds token limit' }, { status: 400 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const gateway = createGateway();

    await expect(gateway.chat(REQUEST)).rejects.toBeInstanceOf(ModelNotFoundError);
    await expect(gateway.chat(REQUEST)).rejects.toThrow('上下文长度');
  });

  it('校验 embedding 数量和 768 维约束', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ embeddings: [[1, 2, 3]] })));
    await expect(createGateway().embed(['你好'])).rejects.toThrow('Embedding 维度或数量不符');
  });

  it('只对首 token 设置 30 秒超时', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init: { signal?: AbortSignal | null }) => {
        const signal = init.signal;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      }),
    );

    const iterator = createGateway().stream(REQUEST)[Symbol.asyncIterator]();
    const assertion = expect(iterator.next()).rejects.toBeInstanceOf(LlmTimeoutError);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it('把外部 AbortSignal 传到底层 fetch', async () => {
    const controller = new AbortController();
    controller.abort(new Error('client closed'));
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init: { signal?: AbortSignal | null }) => Promise.reject(init.signal?.reason)),
    );

    await expect(createGateway().chat(REQUEST, controller.signal)).rejects.toThrow('client closed');
  });

  it('解析 NDJSON 流并发送 done 终止事件', async () => {
    const stream = [
      JSON.stringify({ message: { content: '你' }, done: false }),
      JSON.stringify({ message: { content: '好' }, done: false }),
      JSON.stringify({ message: { content: '' }, done: true, done_reason: 'stop' }),
      '',
    ].join('\n');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } }),
        ),
    );

    const events = [];
    for await (const event of createGateway().stream(REQUEST)) events.push(event);
    expect(events).toEqual([
      { event: 'chunk', data: { text: '你' } },
      { event: 'chunk', data: { text: '好' } },
      { event: 'done', data: { finishReason: 'stop' } },
    ]);
  });
});
