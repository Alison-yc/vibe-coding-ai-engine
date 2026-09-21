import { randomUUID } from 'node:crypto';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChatStreamEventSchema,
  ChatModelCatalogResponseSchema,
  KNOWLEDGE_EMPTY_ANSWER,
  ModelCapabilitySchema,
  type ChatModelCatalogItem,
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
import { AgentService } from '../agent/agent.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { assembleRagPrompt } from '../knowledge/pipeline/prompt';
import { LLM_GATEWAY, type LlmGateway } from '../llm/llm-gateway';
import { findModelCapability, listEvaluatedModelCapabilities } from '../llm/model-capabilities';
import { hasUtilityToolIntent } from '../mcp/merge-tools';
import { CHAT_REPOSITORY, type ChatRepository } from './chat.repository';
import {
  toLlmMessages,
  trimToBudget,
  estimateTokenCount,
  trimHitsToTokenBudget,
} from './context-window';

const TITLE_PREDICT = 24;
const PROMPT_RESERVE_TOKENS = 800;
/** assembleRagPrompt 固定说明 + 分隔符的大致 token 开销 */
const RAG_PROMPT_OVERHEAD = 350;
/** 参考资料最多占上下文预算的比例，其余留给历史与生成 */
const RAG_CITATION_BUDGET_RATIO = 0.45;

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
    @Inject(forwardRef(() => AgentService)) private readonly agent: AgentService,
  ) {}

  async createSession(request: CreateChatSessionRequest): Promise<ChatSession> {
    if (request.modelId) await this.assertModelInstalled(request.modelId);
    return this.repository.createSession({
      title: request.title ?? '新对话',
      modelId: request.modelId ?? this.config.get('OLLAMA_MODEL', { infer: true }),
      datasetIds: request.datasetIds ?? [],
      agentType: request.agentType ?? 'chat',
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
    if (request.modelId) await this.assertModelInstalled(request.modelId);
    const updated = await this.repository.updateSession(id, request);
    if (!updated) throw new Error(`NOT_FOUND:会话不存在`);
    return updated;
  }

  async listModels(): Promise<ChatModelCatalogItem[]> {
    const installed = await this.gateway.listInstalledModels();
    const embeddingModel = this.config.get('OLLAMA_EMBED_MODEL', { infer: true });
    const chatModels = installed.filter(
      (modelId) => modelId !== embeddingModel && !modelId.startsWith('nomic-embed-text'),
    );
    const installedSet = new Set(chatModels);
    const evaluated = listEvaluatedModelCapabilities();
    const evaluatedIds = new Set(evaluated.map((capability) => capability.id));
    return ChatModelCatalogResponseSchema.parse({
      models: [
        ...evaluated.map((capability) => ({
          id: capability.id,
          installed: installedSet.has(capability.id),
          kind: 'evaluated' as const,
          capability,
        })),
        ...chatModels
          .filter((modelId) => !evaluatedIds.has(modelId))
          .map((modelId) => ({
            id: modelId,
            installed: true,
            kind: 'untested' as const,
            capability: ModelCapabilitySchema.parse({
              id: modelId,
              supportsTools: false,
              supportsVision: false,
              supportsJsonMode: false,
              needsToolCallFallback: false,
              maxToolCount: 0,
              effectiveContextTokens: this.config.get('OLLAMA_NUM_CTX', { infer: true }),
              sourceReport: 'untested-conservative-default',
            }),
          })),
      ],
    }).models;
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

    const toolIntent = request.fileAccess || hasUtilityToolIntent(request.content);
    if (toolIntent) {
      const capability = findModelCapability(session.modelId);
      if (!capability?.supportsTools) {
        throw new Error(`模型 ${session.modelId} 未通过工具能力测评，仅支持普通对话与知识库问答`);
      }
      if (request.fileAccess && datasetIds.length > 0) {
        send({
          event: 'warning',
          data: { message: '本轮已开启文件访问，不使用已挂载的知识库。' },
        });
      }
      await this.agent.streamConversation(
        sessionId,
        {
          content: request.content,
          fileAccess: request.fileAccess,
          workspaceRoot: request.workspaceRoot,
          mode: request.mode,
        },
        signal,
        (event) => {
          if (event.event === 'message.start') {
            send({
              event: 'message.start',
              data: { messageId: event.data.messageId, role: 'assistant' },
            });
          } else {
            send(event);
          }
        },
      );
      return;
    }

    await this.repository.appendMessage({
      sessionId,
      role: 'user',
      parts: [{ type: 'text', id: randomUUID(), text: request.content }],
    });

    let citations = await this.collectCitations(datasetIds, request.content);
    if (datasetIds.length > 0 && citations.length === 0) {
      await this.emitStaticAssistant(sessionId, KNOWLEDGE_EMPTY_ANSWER, send);
      await this.maybeTitle(sessionId, request.content);
      return;
    }

    const budget = this.config.get('OLLAMA_NUM_CTX', { infer: true }) - PROMPT_RESERVE_TOKENS;
    if (citations.length > 0) {
      const citationBudget = Math.max(
        Math.floor(budget * RAG_CITATION_BUDGET_RATIO) - RAG_PROMPT_OVERHEAD,
        1,
      );
      citations = trimHitsToTokenBudget(citations, citationBudget);
    }

    const history = await this.repository.listMessages(sessionId);
    const historyMessages = toLlmMessages(history);
    const promptContent =
      citations.length > 0 ? assembleRagPrompt(request.content, citations) : request.content;
    const promptTokens = estimateTokenCount(promptContent);
    const llmMessages =
      citations.length > 0
        ? [
            ...trimToBudget(historyMessages.slice(0, -1), Math.max(budget - promptTokens, 1)),
            { role: 'user' as const, content: promptContent },
          ]
        : trimToBudget(historyMessages, Math.max(budget, 1));

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
          modelId: session.modelId,
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
      } else if (text.length === 0) {
        send({
          event: 'error',
          data: { message: this.publicError(error) },
        });
        send({ event: 'done', data: { messageId: assistantId, status: 'complete' } });
        return;
      }
      // 已有部分内容：保留已生成文本，不再向前端抛 error（避免「写一半又报错」）
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
        modelId: session.modelId,
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

  private async assertModelInstalled(modelId: string): Promise<void> {
    const installed = await this.gateway.listInstalledModels();
    const embeddingModel = this.config.get('OLLAMA_EMBED_MODEL', { infer: true });
    if (
      modelId === embeddingModel ||
      modelId.startsWith('nomic-embed-text') ||
      !installed.includes(modelId)
    ) {
      throw new Error(`模型 ${modelId} 未安装或不能用于对话`);
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
