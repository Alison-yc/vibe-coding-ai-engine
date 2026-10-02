import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
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
import { applyAppTheme, applyDocumentTheme } from './theme';

describe('cn', () => {
  it('合并冲突的 Tailwind class', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});

describe('applyAppTheme', () => {
  it('移除 data-theme 与 dark class', () => {
    const removed: string[] = [];
    const root = {
      classList: {
        remove: (token: string) => {
          removed.push(token);
        },
      },
      removeAttribute: (name: string) => {
        expect(name).toBe('data-theme');
      },
    };
    applyAppTheme(root);
    expect(removed).toEqual(['dark']);
    applyDocumentTheme(root);
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
