import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MUTATIONS } from './mutate-source.js';
import { PathEscapeError, resolveExistingRepoFile } from './paths.js';
import { runVitestFile } from './run-vitest.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');

const readArg = (argv: string[], name: string): string | undefined => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};

export const runMutateCli = async (argv: string[]): Promise<string> => {
  const target = readArg(argv, '--target');
  const spec = readArg(argv, '--file');
  if (!target || !spec) {
    throw new Error('用法：pnpm gen-tests:mutate --target <被测文件> --file <测试文件>');
  }
  const targetPath = await resolveExistingRepoFile(repoRoot, target);
  const specPath = await resolveExistingRepoFile(repoRoot, spec);
  const original = await fs.readFile(targetPath, 'utf8');
  const lines: string[] = [];
  let killed = 0;
  try {
    for (const mutation of MUTATIONS) {
      const mutated = mutation.apply(original);
      if (!mutated || mutated === original) {
        lines.push(`SKIP ${mutation.name}：源码无此模式`);
        continue;
      }
      await fs.writeFile(targetPath, mutated, 'utf8');
      const run = await runVitestFile(repoRoot, specPath);
      if (run.ok) {
        lines.push(`SURVIVE ${mutation.name}：测试仍通过`);
      } else {
        killed += 1;
        lines.push(`KILLED ${mutation.name}：测试已失败`);
      }
    }
  } finally {
    await fs.writeFile(targetPath, original, 'utf8');
  }
  if (killed === 0) throw new Error(`${lines.join('\n')}\n没有任何变异被测试杀死`);
  return `${lines.join('\n')}\n变异验证通过（${killed} 个变异被杀死）\n`;
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    process.stdout.write(await runMutateCli(process.argv.slice(2)));
  } catch (error) {
    const message =
      error instanceof PathEscapeError || error instanceof Error ? error.message : '失败';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
