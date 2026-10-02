import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { BaselineReport, BaselineRow, MetricValue } from './types.js';

const cell = (value: MetricValue | undefined): string =>
  value === null || value === undefined ? '—' : String(value).replaceAll('|', '\\|');

const renderTable = (columns: string[], rows: BaselineRow[]): string => {
  const header = ['id', ...columns];
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map(
      (row) => `| ${[row.id, ...columns.map((column) => cell(row.metrics[column]))].join(' | ')} |`,
    ),
  ].join('\n');
};

const renderSamples = (rows: BaselineRow[]): string => {
  const samples = rows.filter((row) => row.responseExcerpt);
  if (samples.length === 0) return '';
  return [
    '\n响应抽样（最多 160 字符）：',
    ...samples.map((row) => `- \`${row.id}\`：${row.responseExcerpt}`),
  ].join('\n');
};

export const writeBaselineReport = async (
  report: BaselineReport,
  outputDir: string,
): Promise<string> => {
  const date = report.generatedAt.slice(0, 10);
  const slug = report.slug ? `${date}-${report.slug}.md` : `${date}-baseline.md`;
  const target = path.join(outputDir, slug);
  await mkdir(outputDir, { recursive: true });
  const sections = report.sections
    .map((section) =>
      [
        `## ${section.title}`,
        '',
        renderTable(section.columns, section.rows),
        renderSamples(section.rows),
        '',
        '结论：',
        ...section.conclusions.map((conclusion) => `- ${conclusion}`),
      ].join('\n'),
    )
    .join('\n\n');

  const markdown = `# 本地模型能力基线报告（${date}）

> 这是可重复执行的工程评测，不是模型厂商标称能力。原始聚合数据由
> \`pnpm baseline\` 生成；完整模型响应不写日志，报告只保留截断抽样。

## 环境

| 项 | 值 |
| --- | --- |
| Ollama | ${report.environment.ollamaVersion} |
| 主模型 | ${report.environment.model}（${report.environment.modelDigest}） |
| 备选模型 | ${report.environment.largeModel}（${report.environment.largeModelDigest}） |
| Embedding | ${report.environment.embedModel}（${report.environment.embedModelDigest}） |
| 硬件 | ${report.environment.hardware} |
| 生成时间 | ${report.generatedAt} |

${sections}
`;
  await writeFile(target, markdown, 'utf8');
  return target;
};
