import { randomUUID } from 'node:crypto';
import {
  AgentModelResponseSchema,
  ChatResponseSchema,
  type AgentModelRequest,
  type AgentModelResponse,
  LlmStreamEventSchema,
  type ChatRequest,
  type ChatResponse,
  type LlmStreamEvent,
  type ModelCapability,
  type ModelId,
} from '@ai-engine/contracts';
import type { LlmGateway } from './llm-gateway';
import { getModelCapability } from './model-capabilities';

export type FakeLlmCall =
  | { method: 'agentChat'; request: AgentModelRequest; aborted: boolean }
  | { method: 'chat'; request: ChatRequest; aborted: boolean }
  | { method: 'stream'; request: ChatRequest; aborted: boolean }
  | { method: 'embed'; texts: string[]; aborted: boolean }
  | { method: 'countTokens'; text: string };

export class FakeLlmGateway implements LlmGateway {
  readonly calls: FakeLlmCall[] = [];
  private agentReplies: AgentModelResponse[] = [];
  enqueueAgentResponse(response: AgentModelResponse): void {
    this.agentReplies.push(AgentModelResponseSchema.parse(response));
  }

  async agentChat(request: AgentModelRequest, signal?: AbortSignal): Promise<AgentModelResponse> {
    await Promise.resolve();
    this.calls.push({ method: 'agentChat', request, aborted: signal?.aborted ?? false });
    if (signal?.aborted) throw signal.reason;
    const reply = this.agentReplies.shift();
    if (!reply) throw new Error('FakeLlmGateway 没有可用的 agentChat 返回值');
    return reply;
  }

  private chatReplies: ChatResponse[] = [];
  private chatErrors: unknown[] = [];
  private streamReplies: LlmStreamEvent[][] = [];
  private streamErrors: unknown[] = [];
  private embeddingReplies: number[][][] = [];

  enqueueText(text: string, sessionId: string = randomUUID()): void {
    this.chatReplies.push(
      ChatResponseSchema.parse({
        message: {
          id: randomUUID(),
          sessionId,
          role: 'assistant',
          parts: [{ type: 'text', id: randomUUID(), text }],
        },
      }),
    );
  }

  enqueueStream(events: LlmStreamEvent[]): void {
    this.streamReplies.push(events.map((event) => LlmStreamEventSchema.parse(event)));
  }

  enqueueStreamError(error: unknown): void {
    this.streamErrors.push(error);
  }

  enqueueError(error: unknown): void {
    this.chatErrors.push(error);
  }

  setEmbeddings(embeddings: number[][]): void {
    this.embeddingReplies = [embeddings.map((vector) => [...vector])];
  }

  enqueueEmbeddings(embeddings: number[][]): void {
    this.embeddingReplies.push(embeddings.map((vector) => [...vector]));
  }

  async chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    await Promise.resolve();
    this.calls.push({ method: 'chat', request, aborted: signal?.aborted ?? false });
    if (signal?.aborted) throw signal.reason;
    if (this.chatErrors.length > 0) throw this.chatErrors.shift();
    const reply = this.chatReplies.shift();
    if (!reply) throw new Error('FakeLlmGateway 没有可用的 chat 返回值');
    return reply;
  }

  async *stream(request: ChatRequest, signal?: AbortSignal): AsyncIterable<LlmStreamEvent> {
    await Promise.resolve();
    this.calls.push({ method: 'stream', request, aborted: signal?.aborted ?? false });
    if (signal?.aborted) throw signal.reason;
    if (this.streamErrors.length > 0) throw this.streamErrors.shift();
    const events = this.streamReplies.shift() ?? [];
    for (const event of events) {
      if (signal?.aborted) throw signal.reason;
      yield event;
    }
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    await Promise.resolve();
    this.calls.push({ method: 'embed', texts: [...texts], aborted: signal?.aborted ?? false });
    if (signal?.aborted) throw signal.reason;
    const reply = this.embeddingReplies.shift() ?? [];
    if (reply.length !== texts.length) {
      throw new Error(`FakeLlmGateway 预置了 ${reply.length} 个向量，需要 ${texts.length} 个`);
    }
    return reply.map((vector) => [...vector]);
  }

  async countTokens(text: string): Promise<number> {
    await Promise.resolve();
    this.calls.push({ method: 'countTokens', text });
    return Math.ceil([...text].length / 2);
  }

  capabilities(modelId: ModelId): ModelCapability {
    return getModelCapability(modelId);
  }
}
