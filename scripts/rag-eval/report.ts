import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { compareMetrics, flattenMetrics } from './metrics.js';
import type { RagEvalMetrics, RagEvalReport } from './types.js';

const SUMMARY_PREFIX = '<!-- rag-eval-summary:';
const SUMMARY_SUFFIX = ' -->';

const formatMetric = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(4);

const safeLabel = (label: string): string => {
  const normalized = label
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9\u4e00-\u9fff-]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
  return normalized || 'baseline';
};

const renderMetrics = (metrics: RagEvalMetrics, comparison: Record<string, number>): string => {
  const rows = Object.entries(flattenMetrics(metrics)).map(([name, value]) => {
    const delta = comparison[name];
    const deltaText = delta === undefined ? '—' : `${delta > 0 ? '+' : ''}${formatMetric(delta)}`;
    return `| ${name} | ${formatMetric(value)} | ${deltaText} |`;
  });
  return ['| 指标 | 本次 | 相比上次 |', '| --- | ---: | ---: |', ...rows].join('\n');
};

const resolveReportFile = (outputDir: string, fileName: string): string => {
  if (fileName !== path.basename(fileName)) {
    throw new Error(`非法报告文件名：${fileName}`);
  }
  return path.join(outputDir, fileName);
};

const isRagEvalReport = (value: unknown): value is RagEvalReport => {
  if (typeof value !== 'object' || value === null) return false;
  if (!('metrics' in value) || !('config' in value) || !('comparison' in value)) return false;
  return typeof value.metrics === 'object' && value.metrics !== null;
};

const parseReport = (content: string): RagEvalReport | null => {
  const start = content.indexOf(SUMMARY_PREFIX);
  if (start < 0) return null;
  const jsonStart = start + SUMMARY_PREFIX.length;
  const end = content.indexOf(SUMMARY_SUFFIX, jsonStart);
  if (end < 0) return null;
  try {
    const parsed: unknown = JSON.parse(content.slice(jsonStart, end));
    return isRagEvalReport(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const readLatestReport = async (
  outputDir: string,
): Promise<{ fileName: string; report: RagEvalReport } | null> => {
  try {
    const names = (await readdir(outputDir))
      .filter((name) => name.endsWith('.md'))
      .sort()
      .reverse();
    for (const name of names) {
      const report = parseReport(await readFile(resolveReportFile(outputDir, name), 'utf8'));
      if (report) return { fileName: name, report };
    }
    return null;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
};

export const writeRagEvalReport = async (
  reportWithoutComparison: Omit<RagEvalReport, 'previousReport' | 'comparison'>,
  outputDir: string,
): Promise<string> => {
  const previous = await readLatestReport(outputDir);
  const comparison = compareMetrics(
    reportWithoutComparison.metrics,
    previous?.report.metrics ?? null,
  );
  const report: RagEvalReport = {
    ...reportWithoutComparison,
    previousReport: previous?.fileName ?? null,
    comparison,
  };
  const generated = new Date(report.generatedAt);
  const timestamp = [
    generated.getUTCFullYear(),
    String(generated.getUTCMonth() + 1).padStart(2, '0'),
    String(generated.getUTCDate()).padStart(2, '0'),
    '-',
    String(generated.getUTCHours()).padStart(2, '0'),
    String(generated.getUTCMinutes()).padStart(2, '0'),
  ].join('');
  const fileName = `${timestamp}-${safeLabel(report.label)}.md`;
  const target = path.join(outputDir, fileName);
  const configRows = Object.entries(report.config).map(
    ([name, value]) => `| ${name} | ${Array.isArray(value) ? value.join(', ') : String(value)} |`,
  );
  const markdown = `# RAG 评测报告：${report.label}

> 由 \`pnpm rag-eval\` 生成。评测使用固定人工标注集；规则指标不使用 LLM 裁判。

## 运行信息

| 项 | 值 |
| --- | --- |
| 生成时间 | ${report.generatedAt} |
| 上次报告 | ${report.previousReport ?? '无（首次基线）'} |

## 配置快照

| 配置 | 值 |
| --- | --- |
${configRows.join('\n')}

## 指标

${renderMetrics(report.metrics, report.comparison)}

## 说明

- Recall@k 是每条问题中「期望文档落在 topK 的比例」再取平均；命中率是至少命中一篇期望文档的问题比例。
- 引用准确率只认回答正文里的 [#n] 标记，不把检索接口原样返回的 citations 当成模型引用。
- 注入抵抗率看回答是否含 canary；attackRetrievedRate 单独记录攻击文档是否进入上下文。

${SUMMARY_PREFIX}${JSON.stringify(report)}${SUMMARY_SUFFIX}
`;
  await mkdir(outputDir, { recursive: true });
  await writeFile(target, markdown, 'utf8');
  return target;
};

export const compareReportFiles = async (leftPath: string, rightPath: string): Promise<string> => {
  const left = parseReport(await readFile(leftPath, 'utf8'));
  const right = parseReport(await readFile(rightPath, 'utf8'));
  if (!left || !right) throw new Error('报告缺少可解析的 rag-eval-summary');
  const comparison = compareMetrics(right.metrics, left.metrics);
  return Object.entries(comparison)
    .map(([metric, delta]) => `${metric}: ${delta > 0 ? '+' : ''}${formatMetric(delta)}`)
    .join('\n');
};
