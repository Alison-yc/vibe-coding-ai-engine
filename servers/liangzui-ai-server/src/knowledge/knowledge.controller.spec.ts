import { BadRequestException, NotFoundException, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthHarness, registerTestUser, testMeta } from '../auth/auth-test-kit';
import { AuthService } from '../auth/auth.service';
import { AUTH_GLOBAL_GUARDS } from '../auth/global-guards';
import { InMemoryVectorStore } from '../database/in-memory-vector-store';
import { FakeLlmGateway } from '../llm/fake-llm-gateway';
import { IndexingRunner } from './indexing.runner';
import { InMemoryKnowledgeRepository } from './knowledge.repository';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';
import { EmptyPdfTextError, UnsupportedDocumentTypeError } from './pipeline/extract';

const principal = { userId: '00000000-0000-4000-8000-0000000000a1' } as never;

describe('KnowledgeController', () => {
  it('把 NOT_FOUND 映射为 404', async () => {
    const knowledge = {
      getDataset: vi.fn().mockRejectedValue(new Error('NOT_FOUND:知识库不存在')),
    };
    const controller = new KnowledgeController(knowledge as never);
    await expect(
      controller.getDataset(principal, '00000000-0000-4000-8000-000000000001'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('缺少上传文件时 400', () => {
    const controller = new KnowledgeController({} as never);
    expect(() =>
      controller.uploadDocument(principal, '00000000-0000-4000-8000-000000000001', undefined),
    ).toThrow(BadRequestException);
  });

  it('空 PDF 错误映射为 400', async () => {
    const knowledge = {
      createUploadDocument: vi.fn().mockRejectedValue(new EmptyPdfTextError()),
    };
    const controller = new KnowledgeController(knowledge as never);
    await expect(
      controller.uploadDocument(principal, '00000000-0000-4000-8000-000000000001', {
        originalname: 'scan.pdf',
        buffer: Buffer.from('x'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('不支持的类型映射为 400', async () => {
    const knowledge = {
      createUploadDocument: vi.fn().mockRejectedValue(new UnsupportedDocumentTypeError('a.docx')),
    };
    const controller = new KnowledgeController(knowledge as never);
    await expect(
      controller.uploadDocument(principal, '00000000-0000-4000-8000-000000000001', {
        originalname: 'a.docx',
        buffer: Buffer.from('x'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('其它错误原样抛出', async () => {
    const knowledge = {
      getDocument: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const controller = new KnowledgeController(knowledge as never);
    await expect(
      controller.getDocument(principal, '00000000-0000-4000-8000-000000000001'),
    ).rejects.toThrow('boom');
  });

  it('转发 CRUD 与检索成功路径', async () => {
    const knowledge = {
      createDataset: vi.fn().mockResolvedValue({ id: 'd' }),
      listDatasets: vi.fn().mockResolvedValue([]),
      getDataset: vi.fn().mockResolvedValue({ id: 'd' }),
      deleteDataset: vi.fn().mockResolvedValue(undefined),
      listDocuments: vi.fn().mockResolvedValue([]),
      createPasteDocument: vi.fn().mockResolvedValue({ id: 'doc' }),
      getDocument: vi.fn().mockResolvedValue({ id: 'doc' }),
      deleteDocument: vi.fn().mockResolvedValue(undefined),
      reindex: vi.fn().mockResolvedValue({ id: 'doc' }),
      previewSplit: vi.fn().mockReturnValue({ chunks: [] }),
      retrieve: vi.fn().mockResolvedValue({ hits: [] }),
      answer: vi.fn().mockResolvedValue({ answer: '资料中没有相关信息', citations: [] }),
    };
    const controller = new KnowledgeController(knowledge as never);
    const id = '00000000-0000-4000-8000-000000000001';
    const owned = (method: keyof typeof knowledge) => knowledge[method].mock.calls[0]?.[0];
    await expect(controller.createDataset(principal, { name: '库' })).resolves.toEqual({ id: 'd' });
    await expect(controller.listDatasets(principal)).resolves.toEqual([]);
    await expect(controller.getDataset(principal, id)).resolves.toEqual({ id: 'd' });
    await expect(controller.deleteDataset(principal, id)).resolves.toBeUndefined();
    await expect(controller.listDocuments(principal, id)).resolves.toEqual([]);
    await expect(
      controller.createPasteDocument(principal, id, { name: 'a.md', text: 'x' }),
    ).resolves.toEqual({
      id: 'doc',
    });
    await expect(controller.getDocument(principal, id)).resolves.toEqual({ id: 'doc' });
    await expect(controller.deleteDocument(principal, id)).resolves.toBeUndefined();
    await expect(controller.reindex(principal, id)).resolves.toEqual({ id: 'doc' });
    await expect(controller.splitPreview(principal, id, { text: 'x' })).resolves.toEqual({
      chunks: [],
    });
    await expect(
      controller.retrieve(principal, id, { query: 'q', topK: 5, scoreThreshold: 0.3 }),
    ).resolves.toEqual({ hits: [] });
    await expect(
      controller.answer(principal, id, { query: 'q', topK: 5, scoreThreshold: 0.3 }),
    ).resolves.toEqual({
      answer: '资料中没有相关信息',
      citations: [],
    });
    const forwarded = Object.keys(knowledge).filter((method) => method !== 'previewSplit');
    for (const method of forwarded) {
      expect(owned(method as keyof typeof knowledge)).toBe('00000000-0000-4000-8000-0000000000a1');
    }
  });
});

describe('KnowledgeController 鉴权与归属', () => {
  let app: INestApplication;
  const tokens = { owner: '', intruder: '', guest: '' };
  const as = (token: string) =>
    request.agent(app.getHttpServer()).set('authorization', `Bearer ${token}`);

  beforeEach(async () => {
    const harness = createAuthHarness();
    tokens.owner = (await registerTestUser(harness, 'owner@example.com')).token;
    tokens.intruder = (await registerTestUser(harness, 'intruder@example.com')).token;
    tokens.guest = (await harness.auth.issueGuest(testMeta())).token;
    const gateway = new FakeLlmGateway();
    const repository = new InMemoryKnowledgeRepository();
    const store = new InMemoryVectorStore();
    const config = new ConfigService({
      OLLAMA_EMBED_MODEL: 'nomic-embed-text:latest',
      OLLAMA_NUM_CTX: 8192,
      OLLAMA_EMBED_BATCH_SIZE: 32,
    });
    const indexing = new IndexingRunner(repository, store, gateway);
    vi.spyOn(indexing, 'run').mockResolvedValue(undefined);
    const service = new KnowledgeService(repository, store, gateway, indexing, config as never);
    const module = await Test.createTestingModule({
      controllers: [KnowledgeController],
      providers: [
        { provide: KnowledgeService, useValue: service },
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

  it('其他用户读、改、删、检索 A 的知识库与文档一律 404', async () => {
    const owner = () => as(tokens.owner);
    const intruder = () => as(tokens.intruder);
    const dataset = await owner().post('/knowledge/datasets').send({ name: '甲' }).expect(201);
    const datasetId: string = dataset.body.id;
    const document = await owner()
      .post(`/knowledge/datasets/${datasetId}/documents`)
      .send({ name: 'a.md', text: '我住在北京。' })
      .expect(201);
    const documentId: string = document.body.id;
    const query = { query: '北京', topK: 5, scoreThreshold: 0 };

    const listed = await intruder().get('/knowledge/datasets').expect(200);
    expect(listed.body).toEqual([]);
    await intruder().get(`/knowledge/datasets/${datasetId}`).expect(404);
    await intruder().get(`/knowledge/datasets/${datasetId}/documents`).expect(404);
    await intruder()
      .post(`/knowledge/datasets/${datasetId}/documents`)
      .send({ name: 'b.md', text: '入侵' })
      .expect(404);
    await intruder()
      .post(`/knowledge/datasets/${datasetId}/documents/upload`)
      .attach('file', Buffer.from('入侵'), 'b.txt')
      .expect(404);
    await intruder()
      .post(`/knowledge/datasets/${datasetId}/split-preview`)
      .send({ text: 'x' })
      .expect(404);
    await intruder().post(`/knowledge/datasets/${datasetId}/retrieve`).send(query).expect(404);
    await intruder().post(`/knowledge/datasets/${datasetId}/answer`).send(query).expect(404);
    await intruder().get(`/knowledge/documents/${documentId}`).expect(404);
    await intruder().post(`/knowledge/documents/${documentId}/reindex`).expect(404);
    await intruder().delete(`/knowledge/documents/${documentId}`).expect(404);
    await intruder().delete(`/knowledge/datasets/${datasetId}`).expect(404);

    const documents = await owner().get(`/knowledge/datasets/${datasetId}/documents`).expect(200);
    expect(documents.body.map((item: { id: string }) => item.id)).toEqual([documentId]);
    await owner().get(`/knowledge/documents/${documentId}`).expect(200);
  });

  it('访客 403，未带令牌 401', async () => {
    await as(tokens.guest).get('/knowledge/datasets').expect(403);
    await as(tokens.guest).post('/knowledge/datasets').send({ name: '访客' }).expect(403);
    await request(app.getHttpServer()).get('/knowledge/datasets').expect(401);
  });
});
