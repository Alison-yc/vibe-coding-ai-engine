import { expect, test, type Page } from '@playwright/test';
import { mockAuth } from './auth-mock';

const stubBusinessApis = async (page: Page) => {
  await page.route('**/chat/sessions', (route) => route.fulfill({ json: { sessions: [] } }));
  await page.route('**/models', (route) => route.fulfill({ json: { models: [] } }));
  await page.route('**/mcp/servers', (route) => route.fulfill({ json: [] }));
  await page.route('**/agent/tools', (route) =>
    route.fulfill({ json: { tools: [], dropped: [], maxToolCount: 6 } }),
  );
  await page.route('**/knowledge/datasets', (route) => route.fulfill({ json: [] }));
  await page.route('**/workflows', (route) => route.fulfill({ json: { workflows: [] } }));
};

const loginPathFor = (target: string) => `/login?redirect=${encodeURIComponent(target)}`;

test.describe('访客', () => {
  test.beforeEach(async ({ page }) => {
    await stubBusinessApis(page);
    await mockAuth(page, 'guest');
  });

  test('导航锁定知识库与工作流，点击后带回跳地址进入登录页', async ({ page }) => {
    await page.goto('/chat');
    const nav = page.getByRole('navigation');
    const locked = nav.locator('a[data-locked]');
    await expect(locked).toHaveCount(2);
    await expect(locked.nth(0)).toHaveAttribute('href', loginPathFor('/knowledge'));
    await expect(locked.nth(1)).toHaveAttribute('href', loginPathFor('/workflow'));
    await expect(page.getByTestId('chat-guest-hint')).toBeVisible();

    await locked.nth(0).click();
    await expect(page).toHaveURL(loginPathFor('/knowledge'));
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();
  });

  test('直接访问受保护路由会重定向到登录页', async ({ page }) => {
    await page.goto('/workflow');
    await expect(page).toHaveURL(loginPathFor('/workflow'));
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();
  });

  test('设置页只给登录引导，不请求 MCP 管理数据', async ({ page }) => {
    let mcpRequested = false;
    await page.route('**/mcp/servers', (route) => {
      mcpRequested = true;
      return route.fulfill({ json: [] });
    });
    await page.goto('/settings');
    const guide = page.getByTestId('settings-login-guide');
    await expect(guide).toBeVisible();
    await expect(guide.getByRole('link')).toHaveAttribute('href', loginPathFor('/settings'));
    expect(mcpRequested).toBe(false);
  });
});

test.describe('已登录普通用户', () => {
  test.beforeEach(async ({ page }) => {
    await stubBusinessApis(page);
    await mockAuth(page, 'user');
  });

  test('导航无锁定项，可直接进入知识库', async ({ page }) => {
    await page.goto('/knowledge');
    await expect(page).toHaveURL('/knowledge');
    await expect(page.getByRole('navigation').locator('a[data-locked]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '知识库', exact: true })).toBeVisible();
    await expect(page.getByTestId('chat-guest-hint')).toHaveCount(0);
  });

  test('设置页展示 MCP 状态但只读', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('mcp-read-only')).toBeVisible();
    await expect(page.getByTestId('settings-login-guide')).toHaveCount(0);
  });
});
