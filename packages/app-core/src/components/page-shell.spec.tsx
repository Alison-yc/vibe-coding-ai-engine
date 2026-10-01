// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { createI18nOptions } from '../i18n/resources';
import { PageShell } from './page-shell';
import { TestAuthProvider } from '../auth/test-auth';

const i18n = createInstance();

beforeAll(async () => {
  await i18n.init(createI18nOptions('zh-CN'));
});

afterEach(cleanup);

const renderShell = (path: string) =>
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <PageShell title="测试">内容</PageShell>
      </MemoryRouter>
    </I18nextProvider>,
  );

describe('AppNavRail 主导航', () => {
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

describe('AppNavRail 权限锁', () => {
  const renderAs = (role: 'guest' | 'user') =>
    render(
      <I18nextProvider i18n={i18n}>
        <TestAuthProvider role={role}>
          <MemoryRouter initialEntries={['/chat']}>
            <PageShell title="测试">内容</PageShell>
          </MemoryRouter>
        </TestAuthProvider>
      </I18nextProvider>,
    );

  it('访客的知识库、工作流显示锁并指向登录页，对话与设置不锁', () => {
    renderAs('guest');
    const nav = screen.getByRole('navigation', { name: '主导航' });
    const locked = [...nav.querySelectorAll('a[data-locked]')].map((link) =>
      link.getAttribute('href'),
    );
    expect(locked).toEqual([
      `/login?redirect=${encodeURIComponent('/knowledge')}`,
      `/login?redirect=${encodeURIComponent('/workflow')}`,
    ]);
    expect(nav.querySelector('a[data-locked]')?.getAttribute('title')).toBe('登录后可用：知识库');
    expect(screen.getByRole('link', { name: '对话' }).getAttribute('href')).toBe('/chat');
    expect(screen.getByRole('link', { name: '设置' }).getAttribute('href')).toBe('/settings');
  });

  it('登录用户没有锁', () => {
    renderAs('user');
    const nav = screen.getByRole('navigation', { name: '主导航' });
    expect(nav.querySelectorAll('a[data-locked]')).toHaveLength(0);
    expect(screen.getByRole('link', { name: '知识库' }).getAttribute('href')).toBe('/knowledge');
  });
});
