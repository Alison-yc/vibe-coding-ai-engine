import { describe, expect, it } from 'vitest';
import { findForbiddenPatterns } from './forbidden';

describe('findForbiddenPatterns', () => {
  it('检出 only、skip、fetch 与 setTimeout', () => {
    expect(findForbiddenPatterns("it.only('x', () => {})")).toContain('含 it/test/describe.only');
    expect(findForbiddenPatterns('await fetch("/api")')).toContain('含真实 fetch');
    expect(findForbiddenPatterns('setTimeout(() => {}, 10)')).toContain('含 setTimeout 等待');
    expect(findForbiddenPatterns("it('ok', () => { expect(1).toBe(1); })")).toEqual([]);
  });
});
