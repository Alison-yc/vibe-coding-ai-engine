import { expect, test, type Page } from '@playwright/test';

const stubSettingsApis = async (page: Page) => {
  await page.route('**/mcp/servers', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/agent/tools', async (route) => {
    await route.fulfill({ json: { tools: [], dropped: [], maxToolCount: 6 } });
  });
};

const selectLocale = async (page: Page, locale: string) => {
  await page.locator('#settings-ui-locale').evaluate((element, value) => {
    const select = element as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, locale);
};

const dimensions = async (page: Page) => {
  const nav = page.getByTestId('app-nav');
  const card = page.getByTestId('language-card');
  return {
    navHeight: await nav.evaluate((element) => element.getBoundingClientRect().height),
    navOverflow: await nav.evaluate((element) => element.scrollWidth - element.clientWidth),
    cardWidth: await card.evaluate((element) => element.getBoundingClientRect().width),
  };
};

for (const width of [375, 1280]) {
  test(`中日英切换在 ${width}px 视口保持壳层稳定`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await stubSettingsApis(page);
    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
    const baseline = await dimensions(page);

    await selectLocale(page, 'en-US');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    const english = await dimensions(page);

    await selectLocale(page, 'ja-JP');
    await expect(page.getByRole('heading', { name: '設定' })).toBeVisible();
    const japanese = await dimensions(page);

    expect(Math.abs(english.navHeight - baseline.navHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(japanese.navHeight - baseline.navHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(english.cardWidth - baseline.cardWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(japanese.cardWidth - baseline.cardWidth)).toBeLessThanOrEqual(1);
    expect(
      Math.max(baseline.navOverflow, english.navOverflow, japanese.navOverflow),
    ).toBeLessThanOrEqual(1);

    await page.reload();
    await expect(page.getByRole('heading', { name: '設定' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja-JP');
  });
}
