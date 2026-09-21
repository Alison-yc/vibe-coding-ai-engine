import { expect, test } from '@playwright/test';

test('Cmd+K 打开命令面板并可跳转', async ({ page }) => {
  await page.route('**/chat/sessions', async (route) => {
    await route.fulfill({ json: { sessions: [] } });
  });
  await page.route('**/models', async (route) => {
    await route.fulfill({ json: { models: [] } });
  });
  await page.goto('/chat');
  await page.keyboard.press('Meta+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '设置' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
});
