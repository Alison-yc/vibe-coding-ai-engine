import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PathEscapeError, resolveExistingRepoFile } from './paths';

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

describe('resolveExistingRepoFile', () => {
  it('拒绝逃出仓库根目录', async () => {
    await expect(resolveExistingRepoFile(repoRoot, '..')).rejects.toBeInstanceOf(PathEscapeError);
  });

  it('解析仓库内已有文件', async () => {
    const resolved = await resolveExistingRepoFile(
      repoRoot,
      'scripts/gen-tests/fixtures/sample.ts',
    );
    expect(resolved.endsWith(`${path.sep}sample.ts`)).toBe(true);
  });
});
