import { expect, test } from '@playwright/test';

test('对话页渲染侧边栏与输入区', async ({ page }) => {
  await page.goto('/chat');
  await expect(page.getByRole('heading', { name: '对话' })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建会话' })).toBeVisible();
  await expect(page.getByPlaceholder('请先新建会话')).toBeVisible();
});
