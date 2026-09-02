import { expect, test } from '@playwright/test';

test('令牌页可切换主题色并在刷新后保持', async ({ page }) => {
  await page.goto('/dev/tokens');
  await expect(page.getByRole('heading', { name: '设计令牌' })).toBeVisible();
  await expect(page.locator('[data-token="node-running"]')).toBeVisible();

  await page.getByRole('button', { name: '蓝', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'blue');

  await page.getByRole('button', { name: '暗色' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'blue');
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.getByRole('button', { name: '跟随系统' }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
});
