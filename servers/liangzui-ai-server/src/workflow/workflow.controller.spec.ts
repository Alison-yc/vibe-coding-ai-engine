import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { WorkflowGraph } from '@ai-engine/contracts';
import { NodeRegistry } from './nodes/registry';
import { StartNodeRunner } from './nodes/start.runner';
import { EndNodeRunner } from './nodes/end.runner';
import { WorkflowEngine } from './engine/workflow-engine';
import { InMemoryWorkflowRepository } from './workflow.repository';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { createAuthHarness, registerTestUser, testMeta } from '../auth/auth-test-kit';
import { AuthService } from '../auth/auth.service';
import { AUTH_GLOBAL_GUARDS } from '../auth/global-guards';

const graph: WorkflowGraph = {
  nodes: [
    {
      id: 'start',
      type: 'custom-node',
      position: { x: 0, y: 0 },
      data: {
        type: 'start',
        config: { fields: [{ name: 'query', type: 'string', required: true }] },
      },
    },
    {
      id: 'end',
      type: 'custom-node',
      position: { x: 1, y: 0 },
      data: {
        type: 'end',
        config: { outputs: [{ name: 'answer', selector: ['start', 'query'] }] },
      },
    },
  ],
  edges: [{ id: 'edge', source: 'start', target: 'end' }],
  viewport: { x: 0, y: 0, zoom: 1 },
};

describe('WorkflowController', () => {
  let app: INestApplication;
  const tokens = { owner: '', intruder: '', guest: '' };
  const as = (token: string) =>
    request.agent(app.getHttpServer()).set('authorization', `Bearer ${token}`);
  const owner = () => as(tokens.owner);

  beforeEach(async () => {
    const harness = createAuthHarness();
    tokens.owner = (await registerTestUser(harness, 'owner@example.com')).token;
    tokens.intruder = (await registerTestUser(harness, 'intruder@example.com')).token;
    tokens.guest = (await harness.auth.issueGuest(testMeta())).token;
    const repository = new InMemoryWorkflowRepository();
    const registry = new NodeRegistry([new StartNodeRunner(), new EndNodeRunner()]);
    const service = new WorkflowService(repository, new WorkflowEngine(registry), registry);
    const module = await Test.createTestingModule({
      controllers: [WorkflowController],
      providers: [
        { provide: WorkflowService, useValue: service },
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

  it('提供工作流 CRUD、校验和单节点调试接口', async () => {
    const created = await owner().post('/workflows').send({ name: '工作流', graph }).expect(201);
    const id: string = created.body.id;
    await owner().get('/workflows').expect(200);
    await owner().get(`/workflows/${id}`).expect(200);
    await owner()
      .patch(`/workflows/${id}`)
      .send({ name: '草稿名' })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ name: '草稿名', version: 1 }));
    await owner()
      .patch(`/workflows/${id}`)
      .send({ name: '新名称', bumpVersion: true })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ name: '新名称', version: 2 }));
    await owner()
      .post(`/workflows/${id}/validate`)
      .send(graph)
      .expect(201)
      .expect(({ body }) => expect(body.valid).toBe(true));
    await owner()
      .post(`/workflows/${id}/nodes/start/run`)
      .send({ upstreamValues: { sys: { query: '调试' } } })
      .expect(201)
      .expect(({ body }) => expect(body.outputs).toEqual({ query: '调试' }));
    await owner().delete(`/workflows/${id}`).expect(200);
    await owner().get(`/workflows/${id}`).expect(404);
  });

  it('流式运行返回完整终止事件', async () => {
    const created = await owner().post('/workflows').send({ name: '运行', graph }).expect(201);
    const response = await owner()
      .post(`/workflows/${created.body.id}/run`)
      .send({ inputs: { query: '答案' } })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);
    expect(response.text).toContain('event: workflow_started');
    expect(response.text).toContain('event: workflow_finished');
    expect(response.text).toContain('"answer":"答案"');
    const runId = response.text.match(/"runId":"([^"]+)"/)?.[1];
    if (!runId) throw new Error('SSE 缺少 runId');
    await owner()
      .get(`/workflows/${created.body.id}/runs`)
      .expect(200)
      .expect(({ body }) => expect(body.runs).toHaveLength(1));
    await owner()
      .get(`/workflows/runs/${runId}`)
      .expect(200)
      .expect(({ body }) => expect(body.nodeRuns).toHaveLength(2));
  });

  it('有环图运行返回 400，未知运行停止返回未接受', async () => {
    const cyclic = structuredClone(graph);
    cyclic.edges.push({ id: 'cycle', source: 'end', target: 'start' });
    const created = await owner()
      .post('/workflows')
      .send({ name: '有环', graph: cyclic })
      .expect(201);
    await owner()
      .post(`/workflows/${created.body.id}/run`)
      .send({ inputs: { query: '问题' } })
      .expect(400)
      .expect(({ body }) => expect(body.errors[0]).toContain('工作流存在循环'));
    await owner()
      .post('/workflows/runs/00000000-0000-4000-8000-000000000001/stop')
      .expect(201)
      .expect({ accepted: false });
  });

  it('请求参数不合法时由 zod pipe 返回 400', async () => {
    await owner().post('/workflows').send({ name: '', graph: {} }).expect(400);
    await owner().get('/workflows/not-a-uuid').expect(400);
  });

  it('其他用户访问工作流、运行记录与单节点调试一律 404，停止他人运行不被接受', async () => {
    const created = await owner().post('/workflows').send({ name: '甲的', graph }).expect(201);
    const id: string = created.body.id;
    const response = await owner()
      .post(`/workflows/${id}/run`)
      .send({ inputs: { query: '答案' } })
      .expect(200);
    const runId = response.text.match(/"runId":"([^"]+)"/)?.[1];
    if (!runId) throw new Error('SSE 缺少 runId');

    const intruder = () => as(tokens.intruder);
    await intruder()
      .get('/workflows')
      .expect(200)
      .expect(({ body }) => expect(body.workflows).toEqual([]));
    await intruder().get(`/workflows/${id}`).expect(404);
    await intruder().patch(`/workflows/${id}`).send({ name: '乙改的' }).expect(404);
    await intruder().post(`/workflows/${id}/validate`).send(graph).expect(404);
    await intruder()
      .post(`/workflows/${id}/run`)
      .send({ inputs: { query: '偷跑' } })
      .expect(404);
    await intruder()
      .post(`/workflows/${id}/nodes/start/run`)
      .send({ upstreamValues: { sys: { query: '调试' } } })
      .expect(404);
    await intruder().get(`/workflows/${id}/runs`).expect(404);
    await intruder().get(`/workflows/runs/${runId}`).expect(404);
    await intruder().post(`/workflows/runs/${runId}/stop`).expect(201).expect({ accepted: false });
    await intruder().delete(`/workflows/${id}`).expect(404);

    await owner()
      .get(`/workflows/${id}`)
      .expect(200)
      .expect(({ body }) => expect(body.name).toBe('甲的'));
    await owner()
      .get(`/workflows/${id}/runs`)
      .expect(200)
      .expect(({ body }) => expect(body.runs).toHaveLength(1));
  });

  it('访客没有工作流权限，无 token 直接 401', async () => {
    await as(tokens.guest).get('/workflows').expect(403);
    await as(tokens.guest).post('/workflows').send({ name: '访客', graph }).expect(403);
    await request(app.getHttpServer()).get('/workflows').expect(401);
  });
});
