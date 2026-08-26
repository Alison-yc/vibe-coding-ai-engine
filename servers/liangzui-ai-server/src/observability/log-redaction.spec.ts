import { describe, expect, it } from 'vitest';
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
});
