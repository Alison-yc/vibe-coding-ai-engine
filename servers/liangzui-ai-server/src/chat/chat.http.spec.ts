import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentController } from '../agent/agent.controller';
import { AgentService } from '../agent/agent.service';
import { createAuthHarness, registerTestUser, testMeta } from '../auth/auth-test-kit';
import { AuthService } from '../auth/auth.service';
import { AUTH_GLOBAL_GUARDS } from '../auth/global-guards';
import { InMemoryVectorStore } from '../database/in-memory-vector-store';
import { IndexingRunner } from '../knowledge/indexing.runner';
import { InMemoryKnowledgeRepository } from '../knowledge/knowledge.repository';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { FakeLlmGateway } from '../llm/fake-llm-gateway';
import { ChatController } from './chat.controller';
import { InMemoryChatRepository } from './chat.repository';
import { ChatService } from './chat.service';

describe('对话接口鉴权、归属与参数层（HTTP）', () => {
  let app: INestApplication;
  let repository: InMemoryChatRepository;
  let agentStream: ReturnType<typeof vi.fn>;
  const tokens = { owner: '', intruder: '', guest: '' };
  const as = (token: string) =>
    request.agent(app.getHttpServer()).set('authorization', `Bearer ${token}`);

  beforeEach(async () => {
    const harness = createAuthHarness();
    tokens.owner = (await registerTestUser(harness, 'owner@example.com')).token;
    tokens.intruder = (await registerTestUser(harness, 'intruder@example.com')).token;
    tokens.guest = (await harness.auth.issueGuest(testMeta())).token;
    const config = new ConfigService({
      OLLAMA_MODEL: 'qwen3.5:2b',
      OLLAMA_EMBED_MODEL: 'nomic-embed-text:latest',
      OLLAMA_NUM_CTX: 8192,
      OLLAMA_EMBED_BATCH_SIZE: 32,
    });
    const gateway = new FakeLlmGateway();
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const store = new InMemoryVectorStore();
    const knowledge = new KnowledgeService(
      knowledgeRepository,
      store,
      gateway,
      new IndexingRunner(knowledgeRepository, store, gateway),
      config as never,
    );
    repository = new InMemoryChatRepository();
    agentStream = vi.fn();
    const agent = {
      streamConversation: vi.fn(),
      stream: agentStream,
      ownsAgentSession: async (ownerId: string, sessionId: string) =>
        (await repository.getSession(ownerId, sessionId))?.agentType === 'agent',
    } as unknown as AgentService;
    const chat = new ChatService(repository, gateway, knowledge, config as never, agent);
    const module = await Test.createTestingModule({
      controllers: [ChatController, AgentController],
      providers: [
        { provide: ChatService, useValue: chat },
        { provide: AgentService, useValue: agent },
        { provide: AuthService, useValue: harness.auth },
        ...AUTH_GLOBAL_GUARDS,
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('访客伪造 fileAccess、datasetIds 返回 403，不会打开 SSE', async () => {
    const created = await as(tokens.guest).post('/chat/sessions').send({}).expect(201);
    const sessionId: string = created.body.id;
    const forged = [
      { content: '读文件', fileAccess: true, workspaceRoot: '/tmp', mode: 'edit' },
      {
        content: '查库',
        fileAccess: false,
        mode: 'edit',
        datasetIds: ['00000000-0000-4000-8000-000000000099'],
      },
    ];
    for (const body of forged) {
      const response = await as(tokens.guest)
        .post(`/chat/sessions/${sessionId}/stream`)
        .send(body)
        .expect(403);
      expect(response.headers['content-type']).not.toContain('text/event-stream');
    }
    await as(tokens.guest)
      .post('/chat/sessions')
      .send({ datasetIds: ['00000000-0000-4000-8000-000000000099'] })
      .expect(403);
    await expect(repository.listMessages(sessionId)).resolves.toEqual([]);
  });

  it('其他用户对 A 的对话流与文件助手流返回 404', async () => {
    const chatSession = await as(tokens.owner).post('/chat/sessions').send({}).expect(201);
    const agentSession = await as(tokens.owner)
      .post('/chat/sessions')
      .send({ agentType: 'agent' })
      .expect(201);
    const body = { content: '偷看', fileAccess: false, mode: 'edit' };

    await as(tokens.intruder)
      .post(`/chat/sessions/${chatSession.body.id}/stream`)
      .send(body)
      .expect(404);
    await as(tokens.intruder)
      .post(`/agent/${agentSession.body.id}/stream`)
      .send({ content: '偷看', workspaceRoot: '.', mode: 'edit' })
      .expect(404);
    expect(agentStream).not.toHaveBeenCalled();
    await expect(repository.listMessages(chatSession.body.id)).resolves.toEqual([]);
  });
});
