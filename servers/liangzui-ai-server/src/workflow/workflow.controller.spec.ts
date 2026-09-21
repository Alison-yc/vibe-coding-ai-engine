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

  beforeEach(async () => {
    const repository = new InMemoryWorkflowRepository();
    const registry = new NodeRegistry([new StartNodeRunner(), new EndNodeRunner()]);
    const service = new WorkflowService(repository, new WorkflowEngine(registry), registry);
    const module = await Test.createTestingModule({
      controllers: [WorkflowController],
      providers: [{ provide: WorkflowService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('提供工作流 CRUD、校验和单节点调试接口', async () => {
    const created = await request(app.getHttpServer())
      .post('/workflows')
      .send({ name: '工作流', graph })
      .expect(201);
    const id: string = created.body.id;
    await request(app.getHttpServer()).get('/workflows').expect(200);
    await request(app.getHttpServer()).get(`/workflows/${id}`).expect(200);
    await request(app.getHttpServer())
      .patch(`/workflows/${id}`)
      .send({ name: '新名称' })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ name: '新名称', version: 2 }));
    await request(app.getHttpServer())
      .post(`/workflows/${id}/validate`)
      .send(graph)
      .expect(201)
      .expect(({ body }) => expect(body.valid).toBe(true));
    await request(app.getHttpServer())
      .post(`/workflows/${id}/nodes/start/run`)
      .send({ upstreamValues: { sys: { query: '调试' } } })
      .expect(201)
      .expect(({ body }) => expect(body.outputs).toEqual({ query: '调试' }));
    await request(app.getHttpServer()).delete(`/workflows/${id}`).expect(200);
    await request(app.getHttpServer()).get(`/workflows/${id}`).expect(404);
  });

  it('流式运行返回完整终止事件', async () => {
    const created = await request(app.getHttpServer())
      .post('/workflows')
      .send({ name: '运行', graph })
      .expect(201);
    const response = await request(app.getHttpServer())
      .post(`/workflows/${created.body.id}/run`)
      .send({ inputs: { query: '答案' } })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);
    expect(response.text).toContain('event: workflow_started');
    expect(response.text).toContain('event: workflow_finished');
    expect(response.text).toContain('"answer":"答案"');
    const runId = response.text.match(/"runId":"([^"]+)"/)?.[1];
    if (!runId) throw new Error('SSE 缺少 runId');
    await request(app.getHttpServer())
      .get(`/workflows/${created.body.id}/runs`)
      .expect(200)
      .expect(({ body }) => expect(body.runs).toHaveLength(1));
    await request(app.getHttpServer())
      .get(`/workflows/runs/${runId}`)
      .expect(200)
      .expect(({ body }) => expect(body.nodeRuns).toHaveLength(2));
  });

  it('有环图运行返回 400，未知运行停止返回未接受', async () => {
    const cyclic = structuredClone(graph);
    cyclic.edges.push({ id: 'cycle', source: 'end', target: 'start' });
    const created = await request(app.getHttpServer())
      .post('/workflows')
      .send({ name: '有环', graph: cyclic })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/workflows/${created.body.id}/run`)
      .send({ inputs: { query: '问题' } })
      .expect(400)
      .expect(({ body }) => expect(body.errors[0]).toContain('工作流存在循环'));
    await request(app.getHttpServer())
      .post('/workflows/runs/00000000-0000-4000-8000-000000000001/stop')
      .expect(201)
      .expect({ accepted: false });
  });

  it('请求参数不合法时由 zod pipe 返回 400', async () => {
    await request(app.getHttpServer()).post('/workflows').send({ name: '', graph: {} }).expect(400);
    await request(app.getHttpServer()).get('/workflows/not-a-uuid').expect(400);
  });
});
