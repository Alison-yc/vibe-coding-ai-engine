import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { closeOpenFence, MessageParts, StreamMarkdown } from './message-parts';

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
});

describe('MessageParts', () => {
  it('渲染四种 part', () => {
    const html = renderToStaticMarkup(
      createElement(MessageParts, {
        parts: [
          { type: 'text', id: 't', text: '正文' },
          { type: 'reasoning', id: 'r', text: '思考' },
          { type: 'tool', id: 'tool', name: 'read_file', state: 'completed', output: 'ok' },
          {
            type: 'citation',
            id: 'c',
            chunks: [
              {
                documentId: '00000000-0000-4000-8000-000000000001',
                chunkId: '00000000-0000-4000-8000-000000000002',
                documentName: 'a.md',
                text: '原文片段',
              },
            ],
          },
        ],
      }),
    );
    expect(html).toContain('正文');
    expect(html).toContain('思考过程');
    expect(html).toContain('read_file');
    expect(html).toContain('a.md');
    expect(html).toContain('原文片段');
  });
});
