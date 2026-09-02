import { describe, expect, it } from 'vitest';
import { verifyGeneratedSpec } from './verify-generated';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

describe('verifyGeneratedSpec', () => {
  it('淘汰永远通过的弱测试', async () => {
    const result = await verifyGeneratedSpec({
      repoRoot,
      specRelative: 'scripts/gen-tests/fixtures/weak-always-pass.spec.ts',
      targetRelative: 'scripts/gen-tests/fixtures/sample.ts',
    });
    expect(result.passed).toBe(false);
    expect(result.gates.find((item) => item.name.startsWith('有效'))?.ok).toBe(false);
    expect(result.gates.find((item) => item.name === '有增量')?.ok).toBe(false);
  });

  it('强测试能通过四道门禁', async () => {
    const result = await verifyGeneratedSpec({
      repoRoot,
      specRelative: 'scripts/gen-tests/fixtures/sample.spec.ts',
      targetRelative: 'scripts/gen-tests/fixtures/sample.ts',
    });
    expect(result.gates.map((item) => `${item.name}:${item.ok}`)).toEqual([
      '无禁用模式:true',
      '能跑:true',
      '有效（变异）:true',
      '有增量:true',
    ]);
    expect(result.passed).toBe(true);
  });
});
