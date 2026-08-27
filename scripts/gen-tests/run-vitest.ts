import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const runVitestFile = async (
  repoRoot: string,
  specFile: string,
): Promise<{ ok: boolean; output: string }> => {
  try {
    const result = await execFileAsync(
      'pnpm',
      ['exec', 'vitest', 'run', specFile, '--coverage.enabled=false'],
      { cwd: repoRoot, timeout: 120_000 },
    );
    return { ok: true, output: `${result.stdout}\n${result.stderr}` };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: `${err.stdout ?? ''}\n${err.stderr ?? err.message ?? ''}` };
  }
};
