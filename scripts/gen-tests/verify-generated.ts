import fs from 'node:fs/promises';
import path from 'node:path';
import { findForbiddenPatterns } from './forbidden.js';
import { applyNamedMutation, MUTATIONS } from './mutate-source.js';
import { resolveExistingRepoFile } from './paths.js';
import { runVitestFile } from './run-vitest.js';

export type VerifyResult = {
  passed: boolean;
  gates: { name: string; ok: boolean; detail: string }[];
};

const gate = (name: string, ok: boolean, detail: string) => ({ name, ok, detail });

export const verifyGeneratedSpec = async (input: {
  repoRoot: string;
  specRelative: string;
  targetRelative: string;
}): Promise<VerifyResult> => {
  const specPath = await resolveExistingRepoFile(input.repoRoot, input.specRelative);
  const targetPath = await resolveExistingRepoFile(input.repoRoot, input.targetRelative);
  const specSource = await fs.readFile(specPath, 'utf8');
  const gates: VerifyResult['gates'] = [];

  const forbidden = findForbiddenPatterns(specSource);
  gates.push(
    gate(
      '无禁用模式',
      forbidden.length === 0,
      forbidden.length === 0 ? '未发现禁用模式' : forbidden.join('；'),
    ),
  );

  const run = await runVitestFile(input.repoRoot, specPath);
  gates.push(gate('能跑', run.ok, run.ok ? 'vitest 通过' : run.output.slice(-2000)));

  const original = await fs.readFile(targetPath, 'utf8');
  let killed = false;
  let killDetail = '没有任何预设变异能让测试失败（疑似永远通过）';
  if (!run.ok) {
    killDetail = '基线测试未能通过，跳过变异';
  } else {
    try {
      for (const mutation of MUTATIONS) {
        const mutated = applyNamedMutation(original, mutation.name);
        if (!mutated || mutated === original) continue;
        await fs.writeFile(targetPath, mutated, 'utf8');
        const mutatedRun = await runVitestFile(input.repoRoot, specPath);
        if (!mutatedRun.ok) {
          killed = true;
          killDetail = `变异 ${mutation.name} 已让测试变红`;
          break;
        }
      }
    } finally {
      await fs.writeFile(targetPath, original, 'utf8');
    }
  }
  gates.push(gate('有效（变异）', killed, killDetail));

  const targetName = path.basename(targetPath, path.extname(targetPath));
  const mentionsTarget = specSource.includes(targetName);
  const hasMeaningfulAssert = /expect\s*\([\s\S]*?\)\s*\.(?!toBeDefined\b)/.test(specSource);
  const incremental = mentionsTarget && hasMeaningfulAssert;
  gates.push(
    gate(
      '有增量',
      incremental,
      incremental
        ? `测试引用了 ${targetName} 且含非 toBeDefined 断言；覆盖率数值请再跑 pnpm test:cov 对照`
        : !mentionsTarget
          ? `测试未引用被测文件 ${targetName}`
          : '测试只有 toBeDefined 一类断言，覆盖率数字不可信',
    ),
  );
  return { passed: gates.every((item) => item.ok), gates };
};
