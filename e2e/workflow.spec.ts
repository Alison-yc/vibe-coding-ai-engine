import { expect, test } from '@playwright/test';

const workflowId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const graph = {
  nodes: [
    {
      id: 'start',
      type: 'custom-node',
      position: { x: 40, y: 100 },
      data: {
        type: 'start',
        title: '开始',
        config: { fields: [{ name: 'query', type: 'string', required: true }] },
      },
    },
    {
      id: 'retrieval',
      type: 'custom-node',
      position: { x: 280, y: 100 },
      data: {
        type: 'knowledge-retrieval',
        title: '知识检索',
        config: {
          datasetId: '33333333-3333-4333-8333-333333333333',
          query: '{{#start.query#}}',
          topK: 5,
          scoreThreshold: 0.3,
        },
      },
    },
    {
      id: 'llm',
      type: 'custom-node',
      position: { x: 520, y: 100 },
      data: {
        type: 'llm',
        title: 'LLM',
        config: { prompt: '{{#retrieval.chunks#}}\n{{#start.query#}}' },
      },
    },
    {
      id: 'end',
      type: 'custom-node',
      position: { x: 760, y: 100 },
      data: {
        type: 'end',
        title: '结束',
        config: { outputs: [{ name: 'result', selector: ['llm', 'text'] }] },
      },
    },
    ...Array.from({ length: 26 }, (_, index) => ({
      id: `perf_${index}`,
      type: 'custom-node',
      position: { x: 80 + (index % 6) * 180, y: 280 + Math.floor(index / 6) * 110 },
      data: {
        type: 'variable-assigner',
        title: `性能节点 ${index + 1}`,
        config: {
          assignments: [
            { name: `value_${index + 1}`, value: { source: 'constant', value: index } },
          ],
        },
      },
    })),
  ],
  edges: [
    { id: 'one', source: 'start', target: 'retrieval' },
    { id: 'two', source: 'retrieval', target: 'llm' },
    { id: 'three', source: 'llm', target: 'end' },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
};

test('工作流画布保存、运行并展示流式日志', async ({ page }) => {
  let savedGraph: unknown;
  await page.route('**/workflows/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === `/workflows/${workflowId}/runs`) {
      await route.fulfill({ json: { runs: [] } });
      return;
    }
    if (request.method() === 'GET' && url.pathname === `/workflows/${workflowId}`) {
      await route.fulfill({
        json: {
          id: workflowId,
          name: 'E2E 工作流',
          graph,
          version: 1,
          createdAt: '2026-08-28T00:00:00.000Z',
        },
      });
      return;
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/validate')) {
      await route.fulfill({ json: { valid: true, errors: [], warnings: [] } });
      return;
    }
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON();
      savedGraph = body.graph;
      await route.fulfill({
        json: {
          id: workflowId,
          name: body.name,
          graph: body.graph,
          version: 2,
          createdAt: '2026-08-28T00:00:00.000Z',
        },
      });
      return;
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/run')) {
      const events = [
        `event: workflow_started\ndata: ${JSON.stringify({ runId, graphSnapshot: graph })}\n\n`,
        `event: node_started\ndata: ${JSON.stringify({ nodeId: 'llm', inputs: { prompt: '问题' } })}\n\n`,
        `event: node_stream_chunk\ndata: ${JSON.stringify({ nodeId: 'llm', text: '流式回答' })}\n\n`,
        `event: node_finished\ndata: ${JSON.stringify({ nodeId: 'llm', outputs: { text: '流式回答' }, elapsedMs: 20, status: 'completed' })}\n\n`,
        `event: workflow_finished\ndata: ${JSON.stringify({ runId, outputs: { result: '流式回答' }, totalElapsedMs: 25, status: 'completed' })}\n\n`,
      ].join('');
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: events,
      });
      return;
    }
    await route.fulfill({ status: 404, json: { message: '未匹配测试接口' } });
  });

  await page.goto(`/workflow/${workflowId}`);
  await expect(page.getByLabel('工作流名称')).toHaveValue('E2E 工作流');
  await expect(page.getByText('知识检索', { exact: true }).last()).toBeVisible();
  await page
    .getByRole('button', { name: /变量赋值/ })
    .dragTo(page.locator('.react-flow__pane'), { targetPosition: { x: 420, y: 320 } });
  await expect(page.locator('.react-flow__node').filter({ hasText: '变量赋值' })).toHaveCount(1);

  await page.getByRole('button', { name: '保存并校验' }).click();
  await expect(page.getByText('已保存')).toBeVisible();
  expect(JSON.stringify(savedGraph)).not.toContain('"_');

  await page.getByRole('button', { name: '运行', exact: true }).click();
  await page.locator('#run-query').fill('测试问题');
  await page.getByRole('button', { name: '开始运行' }).click();
  await expect(page.getByText('流式回答', { exact: true })).toBeVisible();
  await expect(page.getByText('成功').first()).toBeVisible();
});
