import { expect, test } from '@playwright/test';

test('令牌页展示固定品牌语义色', async ({ page }) => {
  await page.goto('/dev/tokens');
  await expect(page.getByRole('heading', { name: '设计令牌' })).toBeVisible();
  await expect(page.locator('[data-token="node-running"]')).toBeVisible();
  await expect(page.locator('[data-token="node-cat-ai"]')).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
});
