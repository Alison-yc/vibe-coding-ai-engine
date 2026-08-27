import { ConfigService } from '@nestjs/config';
import {
  EMBEDDING_DIMENSION,
  KNOWLEDGE_EMPTY_ANSWER,
  type ChatStreamEvent,
} from '@ai-engine/contracts';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../config/ollama.config';
import { InMemoryVectorStore } from '../database/in-memory-vector-store';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { InMemoryKnowledgeRepository } from '../knowledge/knowledge.repository';
import { IndexingRunner } from '../knowledge/indexing.runner';
import { FakeLlmGateway } from '../llm/fake-llm-gateway';
import { InMemoryChatRepository } from './chat.repository';
import { ChatService } from './chat.service';

const config = new ConfigService<AppConfig, true>({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
  OLLAMA_MODEL: 'qwen3.5:2b',
  OLLAMA_MODEL_LARGE: 'gemma4:e2b',
  OLLAMA_EMBED_MODEL: 'nomic-embed-text:latest',
  OLLAMA_NUM_CTX: 8192,
  OLLAMA_NUM_PREDICT: 2048,
  OLLAMA_TEMPERATURE: 0.2,
  OLLAMA_KEEP_ALIVE: '10m',
  OLLAMA_EMBED_BATCH_SIZE: 32,
  RUN_DB_INTEGRATION: false,
});

const collect = async (
  service: ChatService,
  sessionId: string,
  content: string,
  signal?: AbortSignal,
): Promise<ChatStreamEvent[]> => {
  const events: ChatStreamEvent[] = [];
  await service.stream(sessionId, { content }, signal ?? new AbortController().signal, (event) => {
    events.push(event);
  });
  return events;
};

describe('ChatService', () => {
  const setup = () => {
    const gateway = new FakeLlmGateway();
    const repository = new InMemoryChatRepository();
    const knowledgeRepo = new InMemoryKnowledgeRepository();
    const store = new InMemoryVectorStore();
    const indexing = new IndexingRunner(knowledgeRepo, store, gateway);
    const knowledge = new KnowledgeService(knowledgeRepo, store, gateway, indexing, config);
    const service = new ChatService(repository, gateway, knowledge, config);
    return { gateway, repository, service, knowledge, indexing };
  };

  it('先落库用户消息，再流式输出 assistant，并在结束后生成标题', async () => {
    const { gateway, service } = setup();
    gateway.enqueueStream([
      { event: 'chunk', data: { text: '你好' } },
      { event: 'done', data: { finishReason: 'stop' } },
    ]);
    gateway.enqueueText('问候');
    const session = await service.createSession({});
    const events = await collect(service, session.id, '嗨');
    expect(events.map((event) => event.event)).toContain('message.part.delta');
    expect(events.at(-1)).toMatchObject({ event: 'done', data: { status: 'complete' } });
    const messages = await service.listMessages(session.id);
    expect(messages.map((item) => item.role)).toEqual(['user', 'assistant']);
    expect((await service.getSession(session.id)).title).toBe('问候');
  });

  it('中断时保留已生成文本并标记 interrupted', async () => {
    const { gateway, service } = setup();
    const controller = new AbortController();
    gateway.enqueueStream([
      { event: 'chunk', data: { text: '半句' } },
      { event: 'done', data: { finishReason: 'stop' } },
    ]);
    controller.abort(new Error('client closed'));
    const session = await service.createSession({ title: '已有标题' });
    const events = await collect(service, session.id, '继续', controller.signal);
    expect(events.at(-1)).toMatchObject({ event: 'done', data: { status: 'interrupted' } });
    const assistant = (await service.listMessages(session.id)).find(
      (item) => item.role === 'assistant',
    );
    expect(assistant?.status).toBe('interrupted');
    expect(assistant?.parts[0]).toMatchObject({ type: 'text' });
  });

  it('挂载知识库但没有命中时直接拒答，不调用生成', async () => {
    const { gateway, service, knowledge } = setup();
    const dataset = await knowledge.createDataset({ name: '空库' });
    gateway.enqueueEmbeddings([
      Array.from({ length: EMBEDDING_DIMENSION }, (_, index) => (index === 0 ? 1 : 0)),
    ]);
    const session = await service.createSession({ datasetIds: [dataset.id] });
    const events = await collect(service, session.id, '巴黎天气');
    expect(gateway.calls.some((call) => call.method === 'stream')).toBe(false);
    expect(JSON.stringify(events)).toContain(KNOWLEDGE_EMPTY_ANSWER);
  });

  it('生成失败时用户消息已落库，并返回可操作错误', async () => {
    const { gateway, service } = setup();
    gateway.enqueueStreamError(new Error('fetch failed'));
    const session = await service.createSession({ title: '已有标题' });
    const events = await collect(service, session.id, '还在吗');
    expect(events.some((event) => event.event === 'error')).toBe(true);
    expect(JSON.stringify(events)).toContain('Ollama');
    const messages = await service.listMessages(session.id);
    expect(messages.map((item) => item.role)).toEqual(['user']);
  });

  it('挂载知识库命中后回答带 citations', async () => {
    const { gateway, service, knowledge, indexing } = setup();
    const dataset = await knowledge.createDataset({ name: '个人' });
    const unit = Array.from({ length: EMBEDDING_DIMENSION }, (_, index) => (index === 0 ? 1 : 0));
    gateway.enqueueEmbeddings([unit]);
    const document = await knowledge.createPasteDocument(dataset.id, {
      name: 'bio.md',
      text: '我住在北京。',
    });
    await indexing.run(document.id);
    gateway.enqueueEmbeddings([unit]);
    gateway.enqueueStream([
      { event: 'chunk', data: { text: '住在北京' } },
      { event: 'done', data: { finishReason: 'stop' } },
    ]);
    const session = await service.createSession({ datasetIds: [dataset.id] });
    const events = await collect(service, session.id, '我住哪');
    expect(events.some((event) => event.event === 'message.citations')).toBe(true);
  });
});
