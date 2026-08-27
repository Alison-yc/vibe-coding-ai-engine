import { expect, test } from '@playwright/test';

const sessionId = '11111111-1111-4111-8111-111111111111';
const messageId = '22222222-2222-4222-8222-222222222222';
const approvalId = '33333333-3333-4333-8333-333333333333';

test('文件助手展示工具状态并完成写入审批', async ({ page }) => {
  let decision = '';
  let sent = false;
  await page.route('**/chat/sessions', async (route) => {
    await route.fulfill({
      json: {
        sessions: [
          {
            id: sessionId,
            title: '文件任务',
            modelId: 'qwen3.5:2b',
            datasetIds: [],
            agentType: 'agent',
            createdAt: '2026-08-28T00:00:00.000Z',
            updatedAt: '2026-08-28T00:00:00.000Z',
          },
        ],
      },
    });
  });
  await page.route(`**/chat/sessions/${sessionId}/messages`, async (route) => {
    await route.fulfill({
      json: {
        messages: sent
          ? [
              {
                id: messageId,
                sessionId,
                role: 'assistant',
                seq: 0,
                status: 'complete',
                parts: [
                  {
                    type: 'tool',
                    id: 'call-write',
                    name: 'write',
                    state: decision ? 'completed' : 'pending',
                    input: { path: 'result.md', content: '# 结果' },
                    output: decision ? '写入成功' : undefined,
                    permission: decision
                      ? undefined
                      : {
                          id: approvalId,
                          resource: 'result.md',
                          diff: '+# 结果',
                        },
                  },
                ],
              },
            ]
          : [],
      },
    });
  });
  await page.route(`**/agent/${sessionId}/stream`, async (route) => {
    sent = true;
    const tool = {
      type: 'tool',
      id: 'call-write',
      name: 'write',
      state: 'pending',
      input: { path: 'result.md', content: '# 结果' },
      permission: { id: approvalId, resource: 'result.md', diff: '+# 结果' },
    };
    const events = [
      `event: message.start\ndata: ${JSON.stringify({ messageId })}`,
      `event: tool.update\ndata: ${JSON.stringify({ messageId, part: tool })}`,
      `event: permission.asked\ndata: ${JSON.stringify({
        id: approvalId,
        sessionId,
        toolCallId: 'call-write',
        tool: 'write',
        resource: 'result.md',
        diff: '+# 结果',
      })}`,
    ].join('\n\n');
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: `${events}\n\n`,
    });
  });
  await page.route(`**/agent/${sessionId}/permissions/${approvalId}`, async (route) => {
    const payload = (await route.request().postDataJSON()) as unknown;
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'decision' in payload &&
      typeof payload.decision === 'string'
    ) {
      decision = payload.decision;
    }
    await route.fulfill({ json: { accepted: true } });
  });

  await page.goto(`/agent/${sessionId}`);
  await page.getByLabel('工作区目录').fill('/tmp/agent-workspace');
  await page.getByLabel('文件助手消息').fill('生成 result.md');
  await page.getByRole('button', { name: '发送' }).click();

  await expect(page.getByRole('heading', { name: '需要文件操作审批' })).toBeVisible();
  await expect(page.getByText('+# 结果')).toBeVisible();
  await expect(page.getByText('工具 write · pending')).toBeVisible();
  await expect(page.getByText('工具 write · completed')).toBeHidden();
  await page.getByRole('button', { name: '本会话始终允许' }).click();
  await expect.poll(() => decision).toBe('allow-session');
  await expect(page.getByRole('heading', { name: '需要文件操作审批' })).toBeHidden();
  await expect(page.getByText('工具 write · completed')).toBeVisible();
});
