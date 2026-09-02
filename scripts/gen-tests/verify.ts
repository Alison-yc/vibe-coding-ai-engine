import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PathEscapeError } from './paths.js';
import { verifyGeneratedSpec } from './verify-generated.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');

const readArg = (argv: string[], name: string): string | undefined => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};

export const runVerifyCli = async (argv: string[]): Promise<string> => {
  const spec = readArg(argv, '--file');
  const target = readArg(argv, '--target');
  if (!spec || !target) {
    throw new Error('用法：pnpm gen-tests:verify --file <generated.spec.ts> --target <被测文件>');
  }
  const result = await verifyGeneratedSpec({
    repoRoot,
    specRelative: spec,
    targetRelative: target,
  });
  const body = result.gates
    .map((item) => `${item.ok ? 'PASS' : 'FAIL'} ${item.name}：${item.detail}`)
    .join('\n');
  if (!result.passed) throw new Error(`${body}\n验证未通过`);
  return `${body}\n验证通过\n`;
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    process.stdout.write(await runVerifyCli(process.argv.slice(2)));
  } catch (error) {
    const message =
      error instanceof PathEscapeError || error instanceof Error ? error.message : '失败';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
