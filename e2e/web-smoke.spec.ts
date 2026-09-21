import { expect, test } from '@playwright/test';

test('Web 壳首页能渲染且无控制台错误', async ({ page }) => {
  const pageErrors: string[] = [];
  const failed: string[] = [];
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });
  page.on('response', (res) => {
    if (res.status() < 400) {
      return;
    }
    if (/favicon/i.test(res.url())) {
      return;
    }
    failed.push(`${res.status()} ${res.url()}`);
  });

  await page.goto('/chat');
  await expect(page.getByRole('heading', { name: '对话' })).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(failed.filter((item) => !item.includes('localhost:3000'))).toEqual([]);
});
