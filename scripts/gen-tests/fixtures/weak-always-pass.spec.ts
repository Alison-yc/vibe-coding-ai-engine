import { describe, expect, it } from 'vitest';
import { clamp } from './sample';

// 故意写的弱测试：只用来验证变异门禁会淘汰它。不要并入默认测试套件。
describe('weak always-pass', () => {
  it('exists', () => {
    expect(clamp).toBeDefined();
  });
});
