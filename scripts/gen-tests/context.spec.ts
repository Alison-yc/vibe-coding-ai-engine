import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collectContextPack, uncoveredLinesFromFinal } from './context';

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

describe('collectContextPack', () => {
  it('打包源码、已有测试与测试规范', async () => {
    const targetAbsolute = path.join(repoRoot, 'scripts/gen-tests/fixtures/sample.ts');
    const pack = await collectContextPack({
      repoRoot,
      targetAbsolute,
      targetRelative: 'scripts/gen-tests/fixtures/sample.ts',
      uncoveredLines: [{ line: 1, hits: 0 }],
    });
    expect(pack).toContain('export const clamp');
    expect(pack).toContain('把超过上限的值裁成上限');
    expect(pack).toContain('测试规范');
    expect(pack).toContain('L1');
    expect(pack).toContain('FakeLlmGateway');
  });
});

describe('uncoveredLinesFromFinal', () => {
  it('从 istanbul final 报告取出 hits 为 0 的行', () => {
    const absolute = '/repo/file.ts';
    const lines = uncoveredLinesFromFinal(
      {
        [absolute]: {
          statementMap: {
            '0': { start: { line: 4 } },
            '1': { start: { line: 8 } },
          },
          s: { '0': 0, '1': 3 },
        },
      },
      absolute,
    );
    expect(lines).toEqual([{ line: 4, hits: 0 }]);
  });
});
