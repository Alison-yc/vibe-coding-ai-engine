import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { runGenTestsCli } from './index';

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const tmpDir = path.join(repoRoot, 'scripts/gen-tests/.tmp');

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('runGenTestsCli', () => {
  it('--list 按缺口输出低覆盖文件', async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    const coverage = path.join(tmpDir, 'coverage-summary.json');
    await fs.writeFile(
      coverage,
      JSON.stringify({
        [`${repoRoot}/servers/liangzui-ai-server/src/chat/context-window.ts`]: {
          lines: { pct: 10 },
        },
      }),
      'utf8',
    );
    const output = await runGenTestsCli([
      '--list',
      '--coverage',
      'scripts/gen-tests/.tmp/coverage-summary.json',
    ]);
    expect(output).toContain('context-window.ts');
  });

  it('--target 写出包含源码的上下文包', async () => {
    const output = await runGenTestsCli(['--target', 'scripts/gen-tests/fixtures/sample.ts']);
    expect(output).toContain('已写出上下文包');
    const packPath = path.join(
      repoRoot,
      'scripts/gen-tests/packs/scripts__gen-tests__fixtures__sample.ts.md',
    );
    const pack = await fs.readFile(packPath, 'utf8');
    expect(pack).toContain('export const clamp');
  });
});
