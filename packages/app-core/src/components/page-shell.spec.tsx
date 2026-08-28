// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { createI18nOptions } from '../i18n/resources';
import { AppNavLinks, PageShell } from './page-shell';

const i18n = createInstance();

beforeAll(async () => {
  await i18n.init(createI18nOptions('zh-CN'));
});

afterEach(cleanup);

const renderShell = (path: string) =>
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <PageShell title="测试" nav={<AppNavLinks />}>
          内容
        </PageShell>
      </MemoryRouter>
    </I18nextProvider>,
  );

describe('PageShell 主导航', () => {
  it('高亮当前页面并提供主导航语义', () => {
    renderShell('/settings');

    expect(screen.getByRole('navigation', { name: '主导航' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '设置' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: '对话' }).hasAttribute('aria-current')).toBe(false);
  });

  it('子路由保持对应模块高亮', () => {
    renderShell('/knowledge/11111111-1111-4111-8111-111111111111');

    expect(screen.getByRole('link', { name: '知识库' }).getAttribute('aria-current')).toBe('page');
  });
});
