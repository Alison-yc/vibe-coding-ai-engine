import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ThemeToggle } from './components/theme-toggle';
import { Button } from './components/ui/button';
import { cn } from './lib/utils';
import {
  applyDocumentTheme,
  DEFAULT_THEME_PREFERENCE,
  parseThemePreference,
  resolveAppearance,
  serializeThemePreference,
} from './theme';

describe('cn', () => {
  it('合并冲突的 Tailwind class', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});

describe('parseThemePreference', () => {
  it('空值与非法 JSON 回退默认', () => {
    expect(parseThemePreference(null)).toEqual(DEFAULT_THEME_PREFERENCE);
    expect(parseThemePreference('{')).toEqual(DEFAULT_THEME_PREFERENCE);
    expect(parseThemePreference('[]')).toEqual(DEFAULT_THEME_PREFERENCE);
    expect(parseThemePreference('{"palette":"neon","mode":"light"}')).toEqual(
      DEFAULT_THEME_PREFERENCE,
    );
  });

  it('接受合法偏好', () => {
    expect(parseThemePreference('{"palette":"blue","mode":"dark"}')).toEqual({
      palette: 'blue',
      mode: 'dark',
    });
    expect(serializeThemePreference({ palette: 'blue', mode: 'dark' })).toBe(
      '{"palette":"blue","mode":"dark"}',
    );
  });
});

describe('resolveAppearance', () => {
  it('system 跟随系统，其余用显式模式', () => {
    expect(resolveAppearance('system', 'dark')).toBe('dark');
    expect(resolveAppearance('light', 'dark')).toBe('light');
  });
});

describe('applyDocumentTheme', () => {
  it('默认主题去掉 data-theme 并切换 dark class', () => {
    const toggled: Array<[string, boolean | undefined]> = [];
    const root = {
      classList: {
        toggle: (token: string, force?: boolean) => {
          toggled.push([token, force]);
        },
      },
      setAttribute: () => undefined,
      removeAttribute: (name: string) => {
        expect(name).toBe('data-theme');
      },
    };
    applyDocumentTheme(root, 'neutral', 'dark');
    expect(toggled).toEqual([['dark', true]]);
  });

  it('非默认主题写入 data-theme', () => {
    const attrs: Record<string, string> = {};
    applyDocumentTheme(
      {
        classList: { toggle: () => undefined },
        setAttribute: (name, value) => {
          attrs[name] = value;
        },
        removeAttribute: () => undefined,
      },
      'green',
      'light',
    );
    expect(attrs['data-theme']).toBe('green');
  });
});

describe('Button', () => {
  it('渲染中文标签', () => {
    const html = renderToStaticMarkup(createElement(Button, { type: 'button' }, '确定'));
    expect(html).toContain('确定');
  });

  it('asChild 时把属性交给子元素', () => {
    const html = renderToStaticMarkup(
      createElement(Button, { asChild: true }, createElement('a', { href: '/dev/tokens' }, '令牌')),
    );
    expect(html).toContain('href="/dev/tokens"');
    expect(html).toContain('令牌');
  });
});

describe('ThemeToggle', () => {
  it('渲染外观与主题色按钮', () => {
    const html = renderToStaticMarkup(
      createElement(ThemeToggle, {
        preference: DEFAULT_THEME_PREFERENCE,
        onPreferenceChange: () => undefined,
      }),
    );
    expect(html).toContain('跟随系统');
    expect(html).toContain('蓝');
  });
});
