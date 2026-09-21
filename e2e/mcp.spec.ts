import { expect, test } from '@playwright/test';

test('设置页展示 MCP 状态并可以勾选工具', async ({ page }) => {
  await page.route('**/mcp/servers/filesystem/tools', async (route) => {
    await route.fulfill({
      json: {
        tools: [
          {
            name: 'read_file',
            description: '读取文件',
            exposedName: 'read_file',
            selected: true,
            permissionKind: 'read',
          },
          {
            name: 'write_file',
            description: '写入文件',
            exposedName: 'write_file',
            selected: false,
            permissionKind: 'write',
          },
        ],
      },
    });
  });
  await page.route('**/mcp/servers/filesystem', async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({
        json: {
          name: 'filesystem',
          type: 'stdio',
          enabled: true,
          status: 'connected',
          toolCount: 2,
          selectedToolCount: 2,
        },
      });
      return;
    }
    await route.continue();
  });
  await page.route('**/mcp/servers', async (route) => {
    await route.fulfill({
      json: {
        servers: [
          {
            name: 'filesystem',
            type: 'stdio',
            enabled: true,
            status: 'connected',
            toolCount: 2,
            selectedToolCount: 1,
          },
        ],
      },
    });
  });
  await page.route('**/agent/tools', async (route) => {
    await route.fulfill({
      json: {
        tools: [{ name: 'read', description: '读取', source: 'builtin' }],
        dropped: ['filesystem__extra'],
        maxToolCount: 6,
      },
    });
  });

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  await expect(page.getByText('已连接')).toBeVisible();
  await expect(page.getByText('已裁剪：filesystem__extra')).toBeVisible();
  const patch = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().includes('/mcp/servers/filesystem'),
  );
  await page.getByRole('checkbox', { name: 'write_file' }).click();
  const sent = await patch;
  expect(JSON.parse(sent.postData() ?? '{}')).toEqual({
    toolFilter: { include: ['read_file', 'write_file'] },
  });
});
