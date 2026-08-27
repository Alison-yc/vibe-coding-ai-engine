import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ThemeToggle } from './components/theme-toggle';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './components/ui/card';
import { FileInput } from './components/ui/file-input';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Select } from './components/ui/select';
import { Separator } from './components/ui/separator';
import { Textarea } from './components/ui/textarea';
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

describe('表单与内容原语', () => {
  it('渲染输入控件、标签与文件选择提示', () => {
    const html = renderToStaticMarkup(
      createElement(
        'form',
        null,
        createElement(Label, { htmlFor: 'name' }, '名称'),
        createElement(Input, { id: 'name', value: '知识库', readOnly: true }),
        createElement(Textarea, { value: '正文', readOnly: true }),
        createElement(
          Select,
          { defaultValue: 'recursive' },
          createElement('option', { value: 'recursive' }, '递归'),
        ),
        createElement(FileInput, {
          accept: '.md',
          buttonLabel: '上传文档',
          emptyHint: '尚未选择',
        }),
      ),
    );
    expect(html).toContain('名称');
    expect(html).toContain('知识库');
    expect(html).toContain('正文');
    expect(html).toContain('递归');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('上传文档');
    expect(html).toContain('尚未选择');
    expect(html).toContain('accept=".md"');
  });

  it('渲染卡片、徽章和两种方向的分隔线', () => {
    const html = renderToStaticMarkup(
      createElement(
        Card,
        null,
        createElement(
          CardHeader,
          null,
          createElement(CardTitle, null, '索引状态'),
          createElement(CardDescription, null, '处理进度'),
        ),
        createElement(CardContent, null, createElement(Badge, { variant: 'success' }, '已完成')),
        createElement(Separator),
        createElement(Separator, { orientation: 'vertical' }),
        createElement(CardFooter, null, '底部'),
      ),
    );
    expect(html).toContain('索引状态');
    expect(html).toContain('处理进度');
    expect(html).toContain('已完成');
    expect(html).toContain('aria-orientation="horizontal"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain('底部');
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
