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

  it('没有比较符时把 return 改成 null', () => {
    const result = applyFirstMutation('export const f = () => { return value; };');
    expect(result?.name).toBe('return-to-null');
    expect(result?.mutated).toContain('return null;');
  });
});
