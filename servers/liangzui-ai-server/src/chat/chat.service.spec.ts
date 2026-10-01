import { ConfigService } from '@nestjs/config';
import {
  EMBEDDING_DIMENSION,
  KNOWLEDGE_EMPTY_ANSWER,
  ROLE_PERMISSIONS,
  type ChatStreamEvent,
} from '@ai-engine/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/ollama.config';
import { InMemoryVectorStore } from '../database/in-memory-vector-store';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { InMemoryKnowledgeRepository } from '../knowledge/knowledge.repository';
import { IndexingRunner } from '../knowledge/indexing.runner';
import { FakeLlmGateway } from '../llm/fake-llm-gateway';
import type { AgentService } from '../agent/agent.service';
import { InMemoryChatRepository } from './chat.repository';
import { ChatService } from './chat.service';
import type { ChatActor } from './chat-access';

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const INTRUDER = '00000000-0000-4000-8000-0000000000b2';
const owner: ChatActor = { ownerId: OWNER, permissions: ROLE_PERMISSIONS.user };
const intruder: ChatActor = { ownerId: INTRUDER, permissions: ROLE_PERMISSIONS.user };
const guest: ChatActor = {
  ownerId: '00000000-0000-4000-8000-0000000000c3',
  permissions: ROLE_PERMISSIONS.guest,
};

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
  await service.stream(
    owner,
    sessionId,
    { content, fileAccess: false, mode: 'edit' },
    signal ?? new AbortController().signal,
    (event) => {
      events.push(event);
    },
  );
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
    const streamConversation = vi.fn(async () => undefined);
    const agent = { streamConversation } as unknown as AgentService;
    const service = new ChatService(repository, gateway, knowledge, config, agent);
    return { gateway, repository, service, knowledge, indexing, agent, streamConversation };
  };

  it('先落库用户消息，再流式输出 assistant，并在结束后生成标题', async () => {
    const { gateway, service } = setup();
    gateway.enqueueStream([
      { event: 'chunk', data: { text: '你好' } },
      { event: 'done', data: { finishReason: 'stop' } },
    ]);
    gateway.enqueueText('问候');
    const session = await service.createSession(owner, {});
    const events = await collect(service, session.id, '嗨');
    expect(events.map((event) => event.event)).toContain('message.part.delta');
    expect(events.at(-1)).toMatchObject({ event: 'done', data: { status: 'complete' } });
    const messages = await service.listMessages(OWNER, session.id);
    expect(messages.map((item) => item.role)).toEqual(['user', 'assistant']);
    expect((await service.getSession(OWNER, session.id)).title).toBe('问候');
  });

  it('列出已测评与未知对话模型，并过滤 embedding 模型', async () => {
    const { gateway, service } = setup();
    gateway.setInstalledModels([
      'qwen3.5:2b',
      'gemma4:e2b',
      'other-chat:latest',
      'nomic-embed-text:latest',
    ]);
    const models = await service.listModels();
    expect(models.map((model) => [model.id, model.kind, model.installed])).toEqual([
      ['qwen3.5:2b', 'evaluated', true],
      ['gemma4:e2b', 'evaluated', true],
      ['other-chat:latest', 'untested', true],
    ]);
  });

  it('会话选择的模型进入流式与标题请求', async () => {
    const { gateway, service } = setup();
    gateway.enqueueStream([
      { event: 'chunk', data: { text: 'Gemma 回复' } },
      { event: 'done', data: { finishReason: 'stop' } },
    ]);
    gateway.enqueueText('Gemma 标题');
    const session = await service.createSession(owner, { modelId: 'gemma4:e2b' });
    await collect(service, session.id, '你好');
    const calls = gateway.calls.filter(
      (call) => call.method === 'stream' || call.method === 'chat',
    );
    expect(calls.map((call) => call.request.modelId)).toEqual(['gemma4:e2b', 'gemma4:e2b']);
  });

  it('未知已安装模型仅允许普通对话，拒绝工具意图', async () => {
    const { gateway, service, streamConversation } = setup();
    gateway.setInstalledModels(['qwen3.5:2b', 'gemma4:e2b', 'other-chat:latest']);
    gateway.enqueueStream([{ event: 'done', data: { finishReason: 'stop' } }]);
    gateway.enqueueText('普通标题');
    const session = await service.createSession(owner, { modelId: 'other-chat:latest' });
    await expect(collect(service, session.id, '普通问候')).resolves.toBeDefined();
    await expect(collect(service, session.id, '计算 2+3')).rejects.toThrow('仅支持普通对话');
    expect(streamConversation).not.toHaveBeenCalled();
  });

  it('拒绝未安装模型和 embedding 模型作为会话模型', async () => {
    const { gateway, service } = setup();
    gateway.setInstalledModels(['qwen3.5:2b', 'nomic-embed-text:latest']);
    await expect(service.createSession(owner, { modelId: 'missing:latest' })).rejects.toThrow(
      '未安装',
    );
    await expect(
      service.createSession(owner, { modelId: 'nomic-embed-text:latest' }),
    ).rejects.toThrow('不能用于对话');
  });

  it('旧文件助手会话可从统一对话入口继续使用', async () => {
    const { gateway, repository, service } = setup();
    gateway.enqueueStream([{ event: 'done', data: { finishReason: 'stop' } }]);
    gateway.enqueueText('兼容会话');
    const session = await repository.createSession(OWNER, {
      title: '文件助手',
      modelId: 'qwen3.5:2b',
      datasetIds: [],
      agentType: 'agent',
    });
    await expect(collect(service, session.id, '继续对话')).resolves.toBeDefined();
    expect((await repository.listMessages(session.id)).map((item) => item.role)).toEqual([
      'user',
      'assistant',
    ]);
  });

  it('实用工具意图与文件访问轮次委托统一工具编排', async () => {
    const { service, streamConversation } = setup();
    const session = await service.createSession(owner, {});
    await collect(service, session.id, '计算 2+3');
    expect(streamConversation).toHaveBeenLastCalledWith(
      OWNER,
      session.id,
      expect.objectContaining({ content: '计算 2+3', fileAccess: false }),
      expect.any(AbortSignal),
      expect.any(Function),
    );
    await service.stream(
      owner,
      session.id,
      {
        content: '读取 README.md',
        fileAccess: true,
        workspaceRoot: '/workspace',
        mode: 'read-only',
      },
      new AbortController().signal,
      () => undefined,
    );
    expect(streamConversation).toHaveBeenLastCalledWith(
      OWNER,
      session.id,
      expect.objectContaining({
        content: '读取 README.md',
        fileAccess: true,
        workspaceRoot: '/workspace',
        mode: 'read-only',
      }),
      expect.any(AbortSignal),
      expect.any(Function),
    );
  });

  it('中断时保留已生成文本并标记 interrupted', async () => {
    const { gateway, service } = setup();
    const controller = new AbortController();
    gateway.enqueueStream([
      { event: 'chunk', data: { text: '半句' } },
      { event: 'done', data: { finishReason: 'stop' } },
    ]);
    controller.abort(new Error('client closed'));
    const session = await service.createSession(owner, { title: '已有标题' });
    const events = await collect(service, session.id, '继续', controller.signal);
    expect(events.at(-1)).toMatchObject({ event: 'done', data: { status: 'interrupted' } });
    const assistant = (await service.listMessages(OWNER, session.id)).find(
      (item) => item.role === 'assistant',
    );
    expect(assistant?.status).toBe('interrupted');
    expect(assistant?.parts[0]).toMatchObject({ type: 'text' });
  });

  it('挂载知识库但没有命中时直接拒答，不调用生成', async () => {
    const { gateway, service, knowledge } = setup();
    const dataset = await knowledge.createDataset(OWNER, { name: '空库' });
    gateway.enqueueEmbeddings([
      Array.from({ length: EMBEDDING_DIMENSION }, (_, index) => (index === 0 ? 1 : 0)),
    ]);
    const session = await service.createSession(owner, { datasetIds: [dataset.id] });
    const events = await collect(service, session.id, '巴黎人口');
    expect(gateway.calls.some((call) => call.method === 'stream')).toBe(false);
    expect(JSON.stringify(events)).toContain(KNOWLEDGE_EMPTY_ANSWER);
  });

  it('生成失败时用户消息已落库，并返回可操作错误', async () => {
    const { gateway, service } = setup();
    gateway.enqueueStreamError(new Error('fetch failed'));
    const session = await service.createSession(owner, { title: '已有标题' });
    const events = await collect(service, session.id, '还在吗');
    expect(events.some((event) => event.event === 'error')).toBe(true);
    expect(JSON.stringify(events)).toContain('Ollama');
    const messages = await service.listMessages(OWNER, session.id);
    expect(messages.map((item) => item.role)).toEqual(['user']);
  });

  it('挂载知识库命中后回答带 citations', async () => {
    const { gateway, service, knowledge, indexing } = setup();
    const dataset = await knowledge.createDataset(OWNER, { name: '个人' });
    const unit = Array.from({ length: EMBEDDING_DIMENSION }, (_, index) => (index === 0 ? 1 : 0));
    gateway.enqueueEmbeddings([unit]);
    const document = await knowledge.createPasteDocument(OWNER, dataset.id, {
      name: 'bio.md',
      text: '我住在北京。',
    });
    await indexing.run(document.id);
    gateway.enqueueEmbeddings([unit]);
    gateway.enqueueStream([
      { event: 'chunk', data: { text: '住在北京' } },
      { event: 'done', data: { finishReason: 'stop' } },
    ]);
    const session = await service.createSession(owner, { datasetIds: [dataset.id] });
    const events = await collect(service, session.id, '我住哪');
    expect(events.some((event) => event.event === 'message.citations')).toBe(true);
  });

  it('访客伪造 fileAccess 或非空 datasetIds 时 FORBIDDEN，且不落库、不调用模型', async () => {
    const { gateway, service, repository, streamConversation } = setup();
    const forbidden = /^FORBIDDEN:/;
    const datasetIds = ['00000000-0000-4000-8000-000000000099'];
    const session = await service.createSession(guest, {});
    const forged = [
      { content: '读文件', fileAccess: true, mode: 'edit' as const },
      { content: '查库', fileAccess: false, mode: 'edit' as const, datasetIds },
    ];
    for (const request of forged) {
      await expect(
        service.stream(guest, session.id, request, new AbortController().signal, () => undefined),
      ).rejects.toThrow(forbidden);
    }
    await expect(service.createSession(guest, { datasetIds })).rejects.toThrow(forbidden);
    await expect(service.updateSession(guest, session.id, { datasetIds })).rejects.toThrow(
      forbidden,
    );

    await expect(repository.listMessages(session.id)).resolves.toEqual([]);
    expect(streamConversation).not.toHaveBeenCalled();
    expect(gateway.calls).toEqual([]);
  });

  it('访客切到 gemma4:e2b 能对话但不进入工具路由；同样输入登录用户会走工具', async () => {
    const { gateway, service, streamConversation } = setup();
    const content = '现在几点了';
    const guestSession = await service.createSession(guest, { modelId: 'gemma4:e2b' });
    const prepared = await service.prepareStream(guest, guestSession.id, {
      content,
      fileAccess: false,
      mode: 'edit',
    });
    expect(prepared.access).toEqual({
      modelSwitch: true,
      rag: false,
      tools: false,
      fileAccess: false,
    });
    expect(prepared.toolIntent).toBe(false);
    gateway.enqueueStream([
      { event: 'chunk', data: { text: '我无法查看时间' } },
      { event: 'done', data: { finishReason: 'stop' } },
    ]);
    gateway.enqueueText('时间');
    await service.runStream(prepared, new AbortController().signal, () => undefined);
    expect(streamConversation).not.toHaveBeenCalled();
    const streamed = gateway.calls.filter((call) => call.method === 'stream');
    expect(streamed.map((call) => call.request.modelId)).toEqual(['gemma4:e2b']);

    const userSession = await service.createSession(owner, { modelId: 'gemma4:e2b' });
    const userPrepared = await service.prepareStream(owner, userSession.id, {
      content,
      fileAccess: false,
      mode: 'edit',
    });
    expect(userPrepared.access.tools).toBe(true);
    expect(userPrepared.toolIntent).toBe(true);
    await service.runStream(userPrepared, new AbortController().signal, () => undefined);
    expect(streamConversation).toHaveBeenCalledTimes(1);
  });

  it('没有 chat:model-switch 的角色不能改模型', async () => {
    const { service } = setup();
    const locked: ChatActor = {
      ownerId: OWNER,
      permissions: ROLE_PERMISSIONS.guest.filter((item) => item !== 'chat:model-switch'),
    };
    await expect(service.createSession(locked, { modelId: 'gemma4:e2b' })).rejects.toThrow(
      /^FORBIDDEN:/,
    );
    const session = await service.createSession(locked, {});
    await expect(
      service.updateSession(locked, session.id, { modelId: 'gemma4:e2b' }),
    ).rejects.toThrow(/^FORBIDDEN:/);
    await expect(
      service.updateSession(locked, session.id, { title: '改名' }),
    ).resolves.toMatchObject({ title: '改名' });
  });

  it('不能把其他用户的知识库挂到自己的会话上', async () => {
    const { gateway, service, knowledge, repository } = setup();
    const foreign = await knowledge.createDataset(INTRUDER, { name: '乙的库' });
    const notFound = /^NOT_FOUND:/;

    await expect(service.createSession(owner, { datasetIds: [foreign.id] })).rejects.toThrow(
      notFound,
    );
    const session = await service.createSession(owner, { title: '甲的会话' });
    await expect(
      service.updateSession(owner, session.id, { datasetIds: [foreign.id] }),
    ).rejects.toThrow(notFound);
    await expect(
      service.stream(
        owner,
        session.id,
        { content: '查乙的库', fileAccess: false, mode: 'edit', datasetIds: [foreign.id] },
        new AbortController().signal,
        () => undefined,
      ),
    ).rejects.toThrow(notFound);

    await expect(repository.getSession(OWNER, session.id)).resolves.toMatchObject({
      datasetIds: [],
    });
    await expect(repository.listMessages(session.id)).resolves.toEqual([]);
    expect(gateway.calls.some((call) => call.method === 'embed')).toBe(false);
  });

  it('其他用户读、改、删、续聊、列消息一律当作不存在', async () => {
    const { gateway, service, repository } = setup();
    const session = await service.createSession(owner, { title: '甲的会话' });
    const notFound = /^NOT_FOUND:/;

    await expect(service.listSessions(INTRUDER)).resolves.toEqual([]);
    await expect(service.getSession(INTRUDER, session.id)).rejects.toThrow(notFound);
    await expect(service.updateSession(intruder, session.id, { title: '乙改的' })).rejects.toThrow(
      notFound,
    );
    await expect(service.listMessages(INTRUDER, session.id)).rejects.toThrow(notFound);
    await expect(
      service.stream(
        intruder,
        session.id,
        { content: '偷看', fileAccess: false, mode: 'edit' },
        new AbortController().signal,
        () => undefined,
      ),
    ).rejects.toThrow(notFound);
    await expect(service.deleteSession(INTRUDER, session.id)).rejects.toThrow(notFound);

    expect(gateway.calls).toEqual([]);
    await expect(repository.listMessages(session.id)).resolves.toEqual([]);
    await expect(service.getSession(OWNER, session.id)).resolves.toMatchObject({
      title: '甲的会话',
    });
    await expect(service.listSessions(OWNER)).resolves.toHaveLength(1);
  });
});
