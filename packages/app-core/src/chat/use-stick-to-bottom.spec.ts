import { describe, expect, it } from 'vitest';
import { isNearBottom } from './use-stick-to-bottom';

describe('isNearBottom', () => {
  it('在阈值内视为贴底，上翻后则否', () => {
    expect(isNearBottom(904, 100, 1000)).toBe(true);
    expect(isNearBottom(800, 100, 1000)).toBe(false);
    expect(isNearBottom(0, 100, 100)).toBe(true);
  });
});
