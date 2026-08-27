import { describe, expect, it } from 'vitest';
import { applyFirstMutation } from './mutate-source';

describe('applyFirstMutation', () => {
  it('优先把 === 改成 !==', () => {
    const result = applyFirstMutation('if (items.length === 0) return true;');
    expect(result?.name).toBe('===-to-!==');
    expect(result?.mutated).toContain('!==');
  });

  it('没有可替换模式时返回 null', () => {
    expect(applyFirstMutation('const n = 1;')).toBeNull();
  });
});
