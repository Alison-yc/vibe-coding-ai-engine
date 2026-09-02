import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveExistingRepoFile, toRepoRelative } from './paths.js';

export type UncoveredLine = {
  line: number;
  hits: number;
};

type StatementMap = Record<string, { start?: { line?: number } }>;

export const uncoveredLinesFromFinal = (
  finalReport: Record<string, unknown>,
  absoluteTarget: string,
): UncoveredLine[] => {
  const entry = finalReport[absoluteTarget] as
    { statementMap?: StatementMap; s?: Record<string, number> } | undefined;
  if (!entry?.statementMap || !entry.s) return [];
  const lines = new Map<number, number>();
  for (const [id, loc] of Object.entries(entry.statementMap)) {
    const line = loc.start?.line;
    if (typeof line !== 'number') continue;
    const hits = entry.s[id] ?? 0;
    const previous = lines.get(line);
    if (previous === undefined || hits < previous) lines.set(line, hits);
  }
  return [...lines.entries()]
    .filter(([, hits]) => hits === 0)
    .map(([line, hits]) => ({ line, hits }))
    .sort((left, right) => left.line - right.line);
};

const FAKE_GUIDE = `可用 Fake（不要自造 mock）：
- FakeLlmGateway：可编程 chat/stream/embed，记录 calls，可 enqueueError / enqueueStreamError
- InMemoryVectorStore：无库时的向量检索
- InMemoryChatRepository / InMemoryKnowledgeRepository：单测仓储
单测禁止真实网络、数据库、Ollama、it.only / it.skip、setTimeout 等待。
`;

export const collectContextPack = async (input: {
  repoRoot: string;
  targetAbsolute: string;
  targetRelative: string;
  uncoveredLines: UncoveredLine[];
}): Promise<string> => {
  const source = await fs.readFile(input.targetAbsolute, 'utf8');
  const dir = path.dirname(input.targetAbsolute);
  const names = await fs.readdir(dir);
  const specName = names.find((name) => name.includes('.spec.') && !name.includes('.generated.'));
  const existingTests = specName
    ? await fs.readFile(
        await resolveExistingRepoFile(
          input.repoRoot,
          toRepoRelative(input.repoRoot, path.join(dir, specName)),
        ),
        'utf8',
      )
    : '（同目录没有已有测试）';
  const testingRule = await fs.readFile(
    await resolveExistingRepoFile(input.repoRoot, '.cursor/rules/70-testing.mdc'),
    'utf8',
  );
  const uncovered =
    input.uncoveredLines.length === 0
      ? '未从 coverage-final.json 解析到未覆盖行（可能尚未跑 pnpm test:cov）。'
      : input.uncoveredLines.map((item) => `- L${item.line}`).join('\n');

  return `# 测试生成上下文包

## 目标文件
\`${input.targetRelative}\`

## 未覆盖行
${uncovered}

## 被测源码

\`\`\`ts
${source}
\`\`\`

## 同目录已有测试

\`\`\`ts
${existingTests}
\`\`\`

## 项目测试规范

${testingRule}

## Fake 与约束

${FAKE_GUIDE}

## 生成要求
请用 Vitest 为上述目标生成测试，保存为与源码同目录的 \`*.generated.spec.ts\`。
断言可观察行为，不要只写 toBeDefined。覆盖错误路径与空输入。生成后运行 \`pnpm gen-tests:verify --file <生成文件> --target ${input.targetRelative}\`。
`;
};
