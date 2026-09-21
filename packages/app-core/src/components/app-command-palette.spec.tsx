// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { createI18nOptions } from '../i18n/resources';
import { AppCommandPalette } from './app-command-palette';

const i18n = createInstance();

beforeAll(async () => {
  await i18n.init(createI18nOptions('zh-CN'));
});

afterEach(cleanup);

describe('AppCommandPalette', () => {
  it('Cmd+K 打开并列出主导航项', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <AppCommandPalette />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByRole('dialog', { name: '命令面板' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '对话' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '知识库' })).toBeTruthy();
  });
});
