import * as path from 'node:path';
import { runBaseline } from './runner.js';
import { BASELINE_CASES, type BaselineCaseName, type BaselineOptions } from './types.js';

const readArg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const isCaseName = (value: string): value is BaselineCaseName =>
  BASELINE_CASES.some((caseName) => caseName === value);

const parsePositiveInteger = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--samples 必须是正整数，收到：${value}`);
  }
  return parsed;
};

const selectedCase = readArg('--case');
if (selectedCase && !isCaseName(selectedCase)) {
  throw new Error(`未知测评项：${selectedCase}。可选：${BASELINE_CASES.join(', ')}`);
}

const selectedCases: BaselineCaseName[] =
  selectedCase && isCaseName(selectedCase) ? [selectedCase] : [...BASELINE_CASES];

const baseUrl = process.env.OLLAMA_BASE_URL;
if (!baseUrl) {
  throw new Error('缺少 OLLAMA_BASE_URL。请从 .env.example 复制为 .env 后设置该变量。');
}

const options: BaselineOptions = {
  baseUrl,
  model: readArg('--model') ?? process.env.OLLAMA_MODEL ?? 'qwen3.5:2b',
  largeModel: process.env.OLLAMA_MODEL_LARGE ?? 'gemma4:e2b',
  embedModel: process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text:latest',
  samples: parsePositiveInteger(readArg('--samples')),
  selectedCases,
  outputDir: path.resolve('scripts/model-baseline/reports'),
  force: process.argv.includes('--force'),
};

const reportPath = await runBaseline(options);
process.stdout.write(`[baseline] 报告已生成：${reportPath}\n`);
