import { expect, test, type Page } from '@playwright/test';

const stubSettingsApis = async (page: Page) => {
  await page.route('**/mcp/servers', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/agent/tools', async (route) => {
    await route.fulfill({ json: { tools: [], dropped: [], maxToolCount: 6 } });
  });
  await page.route('**/chat/sessions', async (route) => {
    await route.fulfill({ json: { sessions: [] } });
  });
  await page.route('**/models', async (route) => {
    await route.fulfill({ json: { models: [] } });
  });
  await page.route('**/knowledge/datasets', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/workflows', async (route) => {
    await route.fulfill({ json: { workflows: [] } });
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

test('英文业务主路径在窄屏保持可用且无横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await stubSettingsApis(page);
  await page.goto('/settings');
  await selectLocale(page, 'en-US');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  const routes = ['/chat', '/knowledge', '/workflow'];
  for (const route of routes) {
    await page.goto(route);
    if (route === '/chat') {
      await expect(page.getByRole('button', { name: 'Chat list' })).toBeVisible();
    } else {
      await expect(
        page.getByRole('heading', {
          name: route === '/knowledge' ? 'Knowledge' : 'Workflows',
          exact: true,
        }),
      ).toBeVisible();
    }
    const overflow = await page
      .locator('body')
      .evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }

  const workflowId = '11111111-1111-4111-8111-111111111111';
  await page.route('**/workflows/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === `/workflows/${workflowId}/runs`) {
      await route.fulfill({ json: { runs: [] } });
      return;
    }
    if (pathname === `/workflows/${workflowId}`) {
      await route.fulfill({
        json: {
          id: workflowId,
          name: 'English layout check',
          version: 1,
          createdAt: '2026-08-28T00:00:00.000Z',
          graph: {
            nodes: [
              {
                id: 'start',
                type: 'custom-node',
                position: { x: 40, y: 80 },
                data: {
                  type: 'start',
                  title: 'Start',
                  config: { fields: [{ name: 'query', type: 'string', required: true }] },
                },
              },
              {
                id: 'end',
                type: 'custom-node',
                position: { x: 320, y: 80 },
                data: {
                  type: 'end',
                  title: 'End',
                  config: { outputs: [{ name: 'result', selector: ['start', 'query'] }] },
                },
              },
            ],
            edges: [{ id: 'edge', source: 'start', target: 'end' }],
            viewport: { x: 0, y: 0, zoom: 1 },
          },
        },
      });
      return;
    }
    await route.fallback();
  });
  await page.goto(`/workflow/${workflowId}`);
  const toolbar = page.getByTestId('workflow-toolbar');
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveCSS('overflow-x', 'auto');
  const runButton = page.getByRole('button', { name: 'Run' });
  await runButton.scrollIntoViewIfNeeded();
  await expect(runButton).toBeVisible();
  const editorOverflow = await page
    .locator('body')
    .evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(editorOverflow).toBeLessThanOrEqual(1);
});
