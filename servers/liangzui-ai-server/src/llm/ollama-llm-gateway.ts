import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  ChatResponseSchema,
  EMBEDDING_DIMENSION,
  LlmStreamEventSchema,
  type ChatRequest,
  type ChatResponse,
  type LlmStreamEvent,
  type ModelCapability,
  type ModelId,
} from '@ai-engine/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import type { AppConfig } from '../config/ollama.config';
import { LlmMetricsService } from '../observability/llm-metrics.service';
import { summarizeText } from '../observability/log-redaction';
import {
  ContextOverflowError,
  LlmTimeoutError,
  ModelNotFoundError,
  OllamaUnreachableError,
} from './llm-errors';
import type { LlmGateway } from './llm-gateway';
import { getModelCapability } from './model-capabilities';

const ChatResponseBodySchema = z.object({
  message: z.object({ content: z.string() }),
  prompt_eval_count: z.number().int().nonnegative().optional(),
  eval_count: z.number().int().nonnegative().optional(),
  done_reason: z.string().optional(),
});

const EmbedResponseBodySchema = z.object({
  embeddings: z.array(z.array(z.number())),
});

const GenerateResponseBodySchema = z.object({
  prompt_eval_count: z.number().int().nonnegative(),
});

const StreamChunkSchema = z.object({
  done: z.boolean().optional(),
  message: z
    .object({
      content: z.string().optional(),
      thinking: z.string().optional(),
    })
    .optional(),
  done_reason: z.string().optional(),
});

// chat 120s：覆盖 qwen 冷启动总耗时 5.4s。见 2026-08-26 基线 latency 表。
const CHAT_TIMEOUT_MS = 120_000;
const EMBED_TIMEOUT_MS = 30_000;
// 首 token：冷启动约 3s；挂载 RAG 大 prompt 时 30s 不够，与 chat 总超时对齐下限。
const FIRST_TOKEN_TIMEOUT_MS = 90_000;
const MAX_CONNECTION_RETRIES = 2;

class OllamaResponseError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const responseErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
    ) {
      return body.error;
    }
  } catch {
    // 非 JSON 错误体只保留状态码，不把上游正文写入日志。
  }
  return `HTTP ${response.status}`;
};

@Injectable()
export class OllamaLlmGateway implements LlmGateway {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(LlmMetricsService)
    private readonly metrics: LlmMetricsService,
    @InjectPinoLogger(OllamaLlmGateway.name)
    private readonly logger: PinoLogger,
  ) {}

  async chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const startedAt = performance.now();
    const body = await this.requestJson(
      '/api/chat',
      {
        model: this.config.get('OLLAMA_MODEL', { infer: true }),
        messages: request.messages ?? [{ role: 'user', content: request.content }],
        stream: false,
        think: false,
        keep_alive: this.config.get('OLLAMA_KEEP_ALIVE', { infer: true }),
        options: {
          temperature: this.config.get('OLLAMA_TEMPERATURE', { infer: true }),
          num_ctx: this.config.get('OLLAMA_NUM_CTX', { infer: true }),
          num_predict: request.numPredict ?? this.config.get('OLLAMA_NUM_PREDICT', { infer: true }),
        },
      },
      CHAT_TIMEOUT_MS,
      '模型生成',
      signal,
    );
    const parsed = ChatResponseBodySchema.parse(body);
    const durationMs = Math.round(performance.now() - startedAt);
    const promptTokens = parsed.prompt_eval_count ?? 0;
    const completionTokens = parsed.eval_count ?? 0;
    this.logger.debug({
      operation: 'chat',
      model: this.config.get('OLLAMA_MODEL', { infer: true }),
      promptTokens,
      completionTokens,
      durationMs,
      content: summarizeText(parsed.message.content),
    });
    this.metrics.record({
      operation: 'chat',
      model: this.config.get('OLLAMA_MODEL', { infer: true }),
      promptTokens,
      completionTokens,
      firstTokenMs: durationMs,
      totalMs: durationMs,
      finishReason: parsed.done_reason ?? 'stop',
    });
    return ChatResponseSchema.parse({
      message: {
        id: randomUUID(),
        sessionId: request.sessionId,
        role: 'assistant',
        parts: [{ type: 'text', id: randomUUID(), text: parsed.message.content }],
      },
    });
  }

  async *stream(request: ChatRequest, signal?: AbortSignal): AsyncIterable<LlmStreamEvent> {
    const startedAt = performance.now();
    let firstTokenMs: number | null = null;
    let completionTokens = 0;
    let finishReason: string | null = null;
    const firstTokenController = new AbortController();
    const timer = setTimeout(() => {
      firstTokenController.abort(new LlmTimeoutError('首 token'));
    }, FIRST_TOKEN_TIMEOUT_MS);
    const combinedSignal = signal
      ? AbortSignal.any([signal, firstTokenController.signal])
      : firstTokenController.signal;

    try {
      const response = await this.fetchWithRetry(
        '/api/chat',
        {
          model: this.config.get('OLLAMA_MODEL', { infer: true }),
          messages: request.messages ?? [{ role: 'user', content: request.content }],
          stream: true,
          think: false,
          keep_alive: this.config.get('OLLAMA_KEEP_ALIVE', { infer: true }),
          options: {
            temperature: this.config.get('OLLAMA_TEMPERATURE', { infer: true }),
            num_ctx: this.config.get('OLLAMA_NUM_CTX', { infer: true }),
            num_predict:
              request.numPredict ?? this.config.get('OLLAMA_NUM_PREDICT', { infer: true }),
          },
        },
        combinedSignal,
      );
      if (!response.body) throw new OllamaResponseError(response.status, '流式响应没有 body');
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      let receivedFirstToken = false;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += chunk.value;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let raw: unknown;
          try {
            raw = JSON.parse(line);
          } catch {
            continue;
          }
          const parsed = StreamChunkSchema.safeParse(raw);
          if (!parsed.success) continue;
          const chunk = parsed.data;
          const text = chunk.message?.content ?? '';
          if (text) {
            if (!receivedFirstToken) {
              receivedFirstToken = true;
              firstTokenMs = Math.round(performance.now() - startedAt);
              clearTimeout(timer);
            }
            completionTokens += 1;
            yield LlmStreamEventSchema.parse({ event: 'chunk', data: { text } });
          }
          if (chunk.done) {
            finishReason = chunk.done_reason ?? 'stop';
            yield LlmStreamEventSchema.parse({
              event: 'done',
              data: { finishReason: chunk.done_reason },
            });
          }
        }
      }
      const totalMs = Math.round(performance.now() - startedAt);
      this.metrics.record({
        operation: 'stream',
        model: this.config.get('OLLAMA_MODEL', { infer: true }),
        promptTokens: Math.ceil([...request.content].length / 2),
        completionTokens,
        firstTokenMs,
        totalMs,
        finishReason,
      });
      this.logger.debug({
        operation: 'stream',
        model: this.config.get('OLLAMA_MODEL', { infer: true }),
        completionTokens,
        firstTokenMs,
        totalMs,
        finishReason,
        content: summarizeText(request.content),
      });
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (firstTokenController.signal.aborted) throw firstTokenController.signal.reason;
      throw this.classifyError(error);
    } finally {
      clearTimeout(timer);
    }
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    const startedAt = performance.now();
    const body = await this.requestJson(
      '/api/embed',
      {
        model: this.config.get('OLLAMA_EMBED_MODEL', { infer: true }),
        input: texts,
        keep_alive: this.config.get('OLLAMA_KEEP_ALIVE', { infer: true }),
      },
      EMBED_TIMEOUT_MS,
      '向量化',
      signal,
    );
    const parsed = EmbedResponseBodySchema.parse(body);
    if (
      parsed.embeddings.length !== texts.length ||
      parsed.embeddings.some((vector) => vector.length !== EMBEDDING_DIMENSION)
    ) {
      throw new Error(`Embedding 维度或数量不符：期望 ${texts.length} × ${EMBEDDING_DIMENSION}`);
    }
    const totalMs = Math.round(performance.now() - startedAt);
    this.metrics.record({
      operation: 'embed',
      model: this.config.get('OLLAMA_EMBED_MODEL', { infer: true }),
      promptTokens: 0,
      completionTokens: 0,
      firstTokenMs: null,
      totalMs,
      finishReason: 'stop',
    });
    this.logger.debug({
      operation: 'embed',
      model: this.config.get('OLLAMA_EMBED_MODEL', { infer: true }),
      batchSize: texts.length,
      totalMs,
    });
    return parsed.embeddings;
  }

  async countTokens(text: string): Promise<number> {
    const body = await this.requestJson(
      '/api/generate',
      {
        model: this.config.get('OLLAMA_MODEL', { infer: true }),
        prompt: text,
        stream: false,
        keep_alive: this.config.get('OLLAMA_KEEP_ALIVE', { infer: true }),
        options: { num_predict: 0 },
      },
      EMBED_TIMEOUT_MS,
      'token 计数',
    );
    return GenerateResponseBodySchema.parse(body).prompt_eval_count;
  }

  capabilities(modelId: ModelId): ModelCapability {
    return getModelCapability(modelId);
  }

  private async requestJson(
    endpoint: string,
    body: Record<string, unknown>,
    timeoutMs: number,
    operation: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    try {
      const response = await this.fetchWithRetry(endpoint, body, combinedSignal);
      return await response.json();
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (timeoutSignal.aborted) throw new LlmTimeoutError(operation, { cause: error });
      throw this.classifyError(error);
    }
  }

  private async fetchWithRetry(
    endpoint: string,
    body: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<Response> {
    const baseUrl = this.config.get('OLLAMA_BASE_URL', { infer: true }).replace(/\/$/u, '');
    for (let attempt = 0; attempt <= MAX_CONNECTION_RETRIES; attempt += 1) {
      try {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        });
        if (!response.ok) {
          throw new OllamaResponseError(response.status, await responseErrorMessage(response));
        }
        return response;
      } catch (error) {
        if (!(error instanceof TypeError) || attempt === MAX_CONNECTION_RETRIES) {
          throw error;
        }
        await delay(250 * 2 ** attempt, undefined, { signal });
      }
    }
    throw new OllamaUnreachableError(baseUrl);
  }

  private classifyError(error: unknown): Error {
    if (error instanceof OllamaResponseError) {
      if (error.status === 404 || /model.*not found|pull model/iu.test(error.message)) {
        return new ModelNotFoundError(this.config.get('OLLAMA_MODEL', { infer: true }), {
          cause: error,
        });
      }
      if (/context|token.*limit|too long/iu.test(error.message)) {
        return new ContextOverflowError({ cause: error });
      }
      return error;
    }
    if (error instanceof TypeError) {
      return new OllamaUnreachableError(this.config.get('OLLAMA_BASE_URL', { infer: true }), {
        cause: error,
      });
    }
    return error instanceof Error ? error : new Error('未知 Ollama 错误', { cause: error });
  }
}
