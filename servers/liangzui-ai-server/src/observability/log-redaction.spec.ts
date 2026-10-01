import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { redactRequestBody, summarizeText } from './log-redaction';

describe('summarizeText', () => {
  it('保留长度、预览与哈希，不输出全文', () => {
    const secret = `UNIQUE_MARKER_${'x'.repeat(200)}`;
    const summary = summarizeText(secret);
    expect(summary.length).toBe(secret.length);
    expect(summary.preview.length).toBeLessThanOrEqual(101);
    expect(summary.preview).not.toBe(secret);
    expect(summary.hash).toHaveLength(12);
  });
});

describe('redactRequestBody', () => {
  it('递归脱敏字符串字段', () => {
    const redacted = redactRequestBody({
      text: '这是一段很长的用户输入内容',
      nested: { content: '子字段也要脱敏' },
    }) as { text: { length: number }; nested: { content: { hash: string } } };
    expect(redacted.text.length).toBeGreaterThan(0);
    expect(redacted.nested.content.hash).toHaveLength(12);
  });

  it('密码、验证码、token 和标识只留长度与哈希', () => {
    const body = {
      password: 'correct-horse',
      code: '246810',
      token: 'opaque-token-value',
      identifier: 'user@example.com',
      nested: { authorization: 'Bearer opaque-token-value' },
    };
    const text = JSON.stringify(redactRequestBody(body));
    expect(text).not.toContain('correct-horse');
    expect(text).not.toContain('246810');
    expect(text).not.toContain('opaque-token-value');
    expect(text).not.toContain('user@example.com');
    expect(text).not.toContain('preview');
  });

  it('pino 序列化请求体后仍不含密码、验证码、token 和完整标识', () => {
    const lines: string[] = [];
    const logger = pino(
      {
        serializers: {
          req(request: { body?: unknown }) {
            return { body: redactRequestBody(request.body) };
          },
        },
      },
      {
        write(chunk: string) {
          lines.push(chunk);
        },
      },
    );
    logger.info({
      req: {
        body: {
          password: 'correct-horse',
          code: '246810',
          token: 'opaque-token-value',
          identifier: 'user@example.com',
        },
      },
    });
    const text = lines.join('');
    expect(text).not.toContain('correct-horse');
    expect(text).not.toContain('246810');
    expect(text).not.toContain('opaque-token-value');
    expect(text).not.toContain('user@example.com');
  });
});
