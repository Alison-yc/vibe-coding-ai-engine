import { describe, expect, it } from 'vitest';
import { clamp, isEmpty } from './sample';

describe('sample fixture', () => {
  it('把超过上限的值裁成上限', () => {
    expect(clamp(9, 4)).toBe(4);
  });

  it('空数组判定为 empty', () => {
    expect(isEmpty([])).toBe(true);
    expect(isEmpty(['x'])).toBe(false);
  });
});
