import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChatStreamEventSchema,
  KNOWLEDGE_EMPTY_ANSWER,
  type ChatMessage,
  type ChatSession,
  type ChatStreamEvent,
  type ChatStreamRequest,
  type CreateChatSessionRequest,
  type MessagePart,
  type RetrieveHit,
  type UpdateChatSessionRequest,
} from '@ai-engine/contracts';
import type { AppConfig } from '../config/ollama.config';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { assembleRagPrompt } from '../knowledge/pipeline/prompt';
import { LLM_GATEWAY, type LlmGateway } from '../llm/llm-gateway';
import { CHAT_REPOSITORY, type ChatRepository } from './chat.repository';
import { toLlmMessages, trimToBudget } from './context-window';

const TITLE_PREDICT = 24;
const PROMPT_RESERVE_TOKENS = 800;

const isAbortError = (error: unknown): boolean =>
  (error instanceof Error && error.name === 'AbortError') ||
  (error instanceof Error && error.message === 'client closed');

@Injectable()
export class ChatService {
  constructor(
    @Inject(CHAT_REPOSITORY) private readonly repository: ChatRepository,
    @Inject(LLM_GATEWAY) private readonly gateway: LlmGateway,
    @Inject(KnowledgeService) private readonly knowledge: KnowledgeService,
    @Inject(ConfigService) private readonly config: ConfigService<AppConfig, true>,
  ) {}

  createSession(request: CreateChatSessionRequest): Promise<ChatSession> {
    return this.repository.createSession({
      title: request.title ?? '新对话',
      modelId: this.config.get('OLLAMA_MODEL', { infer: true }),
      datasetIds: request.datasetIds ?? [],
    });
  }

  listSessions(): Promise<ChatSession[]> {
    return this.repository.listSessions();
  }

  async getSession(id: string): Promise<ChatSession> {
    const session = await this.repository.getSession(id);
    if (!session) throw new Error(`NOT_FOUND:会话不存在`);
    return session;
  }

  async updateSession(id: string, request: UpdateChatSessionRequest): Promise<ChatSession> {
    await this.getSession(id);
    const updated = await this.repository.updateSession(id, request);
    if (!updated) throw new Error(`NOT_FOUND:会话不存在`);
    return updated;
  }

  async deleteSession(id: string): Promise<{ ok: true }> {
    await this.getSession(id);
    await this.repository.deleteSession(id);
    return { ok: true };
  }

  async listMessages(sessionId: string): Promise<ChatMessage[]> {
    await this.getSession(sessionId);
    return this.repository.listMessages(sessionId);
  }

  async stream(
    sessionId: string,
    request: ChatStreamRequest,
    signal: AbortSignal,
    emit: (event: ChatStreamEvent) => void,
  ): Promise<void> {
    const send = (event: ChatStreamEvent): void => {
      emit(ChatStreamEventSchema.parse(event));
    };
    const session = await this.getSession(sessionId);
    const datasetIds = request.datasetIds ?? session.datasetIds;
    if (request.datasetIds) {
      await this.repository.updateSession(sessionId, { datasetIds: request.datasetIds });
    }

    await this.repository.appendMessage({
      sessionId,
      role: 'user',
      parts: [{ type: 'text', id: randomUUID(), text: request.content }],
    });

    const citations = await this.collectCitations(datasetIds, request.content);
    if (datasetIds.length > 0 && citations.length === 0) {
      await this.emitStaticAssistant(sessionId, KNOWLEDGE_EMPTY_ANSWER, send);
      await this.maybeTitle(sessionId, request.content);
      return;
    }

    const history = await this.repository.listMessages(sessionId);
    const budget = this.config.get('OLLAMA_NUM_CTX', { infer: true }) - PROMPT_RESERVE_TOKENS;
    const trimmed = await trimToBudget(toLlmMessages(history), Math.max(budget, 1), (text) =>
      this.gateway.countTokens(text),
    );
    const lastUser = trimmed.at(-1);
    const promptContent =
      citations.length > 0 && lastUser
        ? assembleRagPrompt(request.content, citations)
        : request.content;
    const llmMessages =
      citations.length > 0
        ? [...trimmed.slice(0, -1), { role: 'user' as const, content: promptContent }]
        : trimmed.length > 0
          ? trimmed
          : [{ role: 'user' as const, content: promptContent }];

    const assistantId = randomUUID();
    const partId = randomUUID();
    send({ event: 'message.start', data: { messageId: assistantId, role: 'assistant' } });
    send({
      event: 'message.part.start',
      data: { messageId: assistantId, partId, type: 'text' },
    });

    let text = '';
    let interrupted = false;
    try {
      for await (const event of this.gateway.stream(
        {
          sessionId,
          content: promptContent,
          messages: llmMessages,
        },
        signal,
      )) {
        if (event.event === 'chunk') {
          text += event.data.text;
          send({
            event: 'message.part.delta',
            data: { messageId: assistantId, partId, text: event.data.text },
          });
        }
      }
    } catch (error) {
      if (isAbortError(error) || signal.aborted) {
        interrupted = true;
      } else {
        if (text.length > 0) {
          await this.repository.appendMessage({
            id: assistantId,
            sessionId,
            role: 'assistant',
            parts: [{ type: 'text', id: partId, text }],
            status: 'complete',
          });
        }
        send({
          event: 'error',
          data: { message: this.publicError(error) },
        });
        send({ event: 'done', data: { messageId: assistantId, status: 'complete' } });
        return;
      }
    }

    send({ event: 'message.part.end', data: { messageId: assistantId, partId } });
    if (citations.length > 0) {
      send({
        event: 'message.citations',
        data: {
          messageId: assistantId,
          chunks: citations.map((hit) => ({
            documentId: hit.documentId,
            chunkId: hit.chunkId,
            documentName: hit.documentName,
            text: hit.content,
            score: hit.score,
          })),
        },
      });
    }

    const parts: MessagePart[] = [{ type: 'text', id: partId, text: text || '…' }];
    if (citations.length > 0) {
      parts.push({
        type: 'citation',
        id: randomUUID(),
        chunks: citations.map((hit) => ({
          documentId: hit.documentId,
          chunkId: hit.chunkId,
          documentName: hit.documentName,
          text: hit.content,
          score: hit.score,
        })),
      });
    }
    await this.repository.appendMessage({
      id: assistantId,
      sessionId,
      role: 'assistant',
      parts,
      status: interrupted ? 'interrupted' : 'complete',
    });
    send({
      event: 'done',
      data: { messageId: assistantId, status: interrupted ? 'interrupted' : 'complete' },
    });
    if (!interrupted) await this.maybeTitle(sessionId, request.content);
  }

  private async emitStaticAssistant(
    sessionId: string,
    text: string,
    send: (event: ChatStreamEvent) => void,
  ): Promise<void> {
    const assistantId = randomUUID();
    const partId = randomUUID();
    send({ event: 'message.start', data: { messageId: assistantId, role: 'assistant' } });
    send({
      event: 'message.part.start',
      data: { messageId: assistantId, partId, type: 'text' },
    });
    send({ event: 'message.part.delta', data: { messageId: assistantId, partId, text } });
    send({ event: 'message.part.end', data: { messageId: assistantId, partId } });
    const parts: MessagePart[] = [{ type: 'text', id: partId, text }];
    await this.repository.appendMessage({
      id: assistantId,
      sessionId,
      role: 'assistant',
      parts,
    });
    send({ event: 'done', data: { messageId: assistantId, status: 'complete' } });
  }

  private async collectCitations(datasetIds: string[], query: string): Promise<RetrieveHit[]> {
    if (datasetIds.length === 0) return [];
    const hits: RetrieveHit[] = [];
    for (const datasetId of datasetIds) {
      const retrieved = await this.knowledge.retrieve(datasetId, {
        query,
        topK: 5,
        scoreThreshold: 0.3,
      });
      hits.push(...retrieved.hits);
    }
    return hits;
  }

  private async maybeTitle(sessionId: string, userText: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session.title !== '新对话') return;
    const fallback = [...userText].slice(0, 20).join('') || '新对话';
    try {
      const response = await this.gateway.chat({
        sessionId,
        content: `用不超过20个字为这段用户问题生成会话标题，只输出标题：\n${userText}`,
        numPredict: TITLE_PREDICT,
      });
      const textPart = response.message.parts.find((part) => part.type === 'text');
      const raw = textPart && textPart.type === 'text' ? textPart.text.trim() : '';
      const cleaned =
        raw
          .replace(/^标题[:：]\s*/, '')
          .split('\n')[0]
          ?.trim() ?? '';
      const title = [...(cleaned || fallback)].slice(0, 20).join('') || fallback;
      await this.repository.updateSession(sessionId, { title });
    } catch {
      await this.repository.updateSession(sessionId, { title: fallback });
    }
  }

  private publicError(error: unknown): string {
    const message = error instanceof Error ? error.message : '生成失败';
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return '无法连接 Ollama，请确认本机模型服务已启动';
    }
    return message;
  }
}
