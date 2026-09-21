import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectContextPack, uncoveredLinesFromFinal } from './context.js';
import { parseCoverageSummary, rankLowCoverageFiles } from './rank.js';
import {
  PathEscapeError,
  resolveExistingRepoFile,
  resolveRepoOutputFile,
  toRepoRelative,
} from './paths.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');

const readArg = (argv: string[], name: string): string | undefined => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};

const loadJson = async (filePath: string): Promise<Record<string, unknown>> =>
  JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>;

export const runGenTestsCli = async (argv: string[]): Promise<string> => {
  if (argv.includes('--list')) {
    const coverageArg = readArg(argv, '--coverage');
    const coveragePath = await resolveExistingRepoFile(
      repoRoot,
      coverageArg ?? 'coverage/coverage-summary.json',
    );
    const summaryRaw = await loadJson(coveragePath);
    const ranked = rankLowCoverageFiles(parseCoverageSummary(summaryRaw, repoRoot));
    if (ranked.length === 0) return '没有低于阈值的文件。\n';
    return ranked
      .slice(0, 20)
      .map(
        (file, index) =>
          `${index + 1}. ${file.path}  lines=${file.linesPct.toFixed(1)}%  阈值=${file.threshold}  缺口权重=${file.deficit.toFixed(1)}`,
      )
      .join('\n')
      .concat('\n');
  }

  const targetArg = readArg(argv, '--target');
  if (!targetArg) {
    throw new Error('用法：pnpm gen-tests --list | pnpm gen-tests --target <file>');
  }
  const targetAbsolute = await resolveExistingRepoFile(repoRoot, targetArg);
  const targetRelative = toRepoRelative(repoRoot, targetAbsolute);
  let uncovered: { line: number; hits: number }[] = [];
  try {
    const finalPath = await resolveExistingRepoFile(repoRoot, 'coverage/coverage-final.json');
    const finalRaw = await loadJson(finalPath);
    uncovered = uncoveredLinesFromFinal(finalRaw, targetAbsolute);
  } catch {
    uncovered = [];
  }
  const pack = await collectContextPack({
    repoRoot,
    targetAbsolute,
    targetRelative,
    uncoveredLines: uncovered,
  });
  const outPath = await resolveRepoOutputFile(
    repoRoot,
    `scripts/gen-tests/packs/${targetRelative.replaceAll('/', '__')}.md`,
  );
  await fs.writeFile(outPath, pack, 'utf8');
  return `已写出上下文包：${toRepoRelative(repoRoot, outPath)}\n下一步：把该文件喂给 Cursor 生成 *.generated.spec.ts，再跑 pnpm gen-tests:verify。\n`;
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    process.stdout.write(await runGenTestsCli(process.argv.slice(2)));
  } catch (error) {
    const message =
      error instanceof PathEscapeError || error instanceof Error ? error.message : '失败';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
