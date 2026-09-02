import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import enUSChat from '../i18n/locales/en-US/chat.json';
import jaJPChat from '../i18n/locales/ja-JP/chat.json';
import zhCNChat from '../i18n/locales/zh-CN/chat.json';
import { createI18nOptions } from '../i18n/resources';
import { closeOpenFence, MessageParts, StreamMarkdown } from './message-parts';

const i18n = createInstance();
beforeAll(async () => {
  await i18n.init(createI18nOptions('en-US'));
});

const leafKeys = (value: unknown, prefix = ''): string[] =>
  Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'object' && child !== null ? leafKeys(child, path) : [path];
  });

describe('chat locale resources', () => {
  it('三种语言的 key 树完全一致', () => {
    const expected = leafKeys(zhCNChat).sort();
    expect(leafKeys(jaJPChat).sort()).toEqual(expected);
    expect(leafKeys(enUSChat).sort()).toEqual(expected);
  });
});

describe('closeOpenFence', () => {
  it('为未闭合代码块补上结束标记', () => {
    expect(closeOpenFence('```ts\nconst x = 1')).toMatch(/```$/);
    expect(closeOpenFence('```ts\nconst x = 1\n```')).toBe('```ts\nconst x = 1\n```');
  });
});

describe('StreamMarkdown XSS', () => {
  it('不把 script 和 img onerror 渲染成可执行 HTML', () => {
    const html = renderToStaticMarkup(
      createElement(StreamMarkdown, {
        text: '前缀 <script>alert(1)</script> <img onerror="alert(2)" src="x" />',
      }),
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toMatch(/<img\b/i);
    expect(html).toContain('前缀');
    expect(html).toContain('&lt;script&gt;');
  });

  it('未闭合代码块也能渲染', () => {
    const html = renderToStaticMarkup(
      createElement(StreamMarkdown, { text: '```js\nconsole.log(1)' }),
    );
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain('console');
  });

  it('表格包在横向滚动容器内', () => {
    const html = renderToStaticMarkup(
      createElement(StreamMarkdown, {
        text: '| A | B |\n| --- | --- |\n| 1 | 2 |',
      }),
    );
    expect(html).toContain('overflow-x-auto');
    expect(html).toContain('<table');
  });
});

describe('MessageParts', () => {
  it('渲染四种 part', () => {
    const html = renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n },
        createElement(MessageParts, {
          parts: [
            { type: 'text', id: 't', text: '正文' },
            { type: 'reasoning', id: 'r', text: '思考' },
            {
              type: 'tool',
              id: 'tool',
              name: 'read_file',
              state: 'completed',
              output: 'ok',
            },
            {
              type: 'citation',
              id: 'c',
              chunks: [
                {
                  documentId: '00000000-0000-4000-8000-000000000001',
                  chunkId: '00000000-0000-4000-8000-000000000002',
                  documentName: 'a.md',
                  text: '原文片段',
                  score: 0.413,
                },
              ],
            },
          ],
        }),
      ),
    );
    expect(html).toContain('正文');
    expect(html).toContain('Reasoning');
    expect(html).toContain('read_file');
    expect(html).toContain('Completed');
    expect(html).toContain('Sources (1)');
    expect(html).toContain('a.md');
    expect(html).toContain('原文片段');
    expect(html).not.toContain('0.413');
  });
});
