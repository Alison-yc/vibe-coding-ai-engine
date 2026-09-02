import {
  DEFAULT_CHUNK_CONFIG,
  RAG_PROMPT_VERSION,
  RetrieveRequestSchema,
} from '@ai-engine/contracts';
import { compareReportFiles } from './report.js';
import { runRagEval, selectDatasets } from './runner.js';
import { EVAL_DATASETS, type EvalDatasetName } from './types.js';

const retrieveDefaults = RetrieveRequestSchema.parse({ query: 'defaults' });

const readArg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const parseNumber = (
  name: string,
  fallback: number,
  validate: (value: number) => boolean,
): number => {
  const raw = readArg(name);
  const value = raw === undefined ? fallback : Number(raw);
  if (!validate(value)) throw new Error(`${name} 参数无效：${raw ?? String(fallback)}`);
  return value;
};

const selectedValue = readArg('--dataset');
const selectedDataset: EvalDatasetName | undefined = EVAL_DATASETS.find(
  (name) => name === selectedValue,
);
if (selectedValue && !selectedDataset) {
  throw new Error(`未知数据集：${selectedValue}。可选：${EVAL_DATASETS.join(', ')}`);
}

const compareIndex = process.argv.indexOf('--compare');
if (compareIndex >= 0) {
  const left = process.argv[compareIndex + 1];
  const right = process.argv[compareIndex + 2];
  if (!left || !right) throw new Error('--compare 需要两个报告路径');
  process.stdout.write(`${await compareReportFiles(left, right)}\n`);
} else {
  const apiBaseUrl = process.env.RAG_EVAL_API_BASE_URL;
  if (!apiBaseUrl) {
    throw new Error('缺少 RAG_EVAL_API_BASE_URL；请检查 .env.example/.env');
  }
  const chunkSize = parseNumber(
    '--chunk-size',
    DEFAULT_CHUNK_CONFIG.chunkSize,
    (value) => Number.isInteger(value) && value > 0,
  );
  const overlap = parseNumber(
    '--overlap',
    DEFAULT_CHUNK_CONFIG.overlap,
    (value) => Number.isInteger(value) && value >= 0 && value < chunkSize,
  );
  const topK = parseNumber(
    '--top-k',
    retrieveDefaults.topK,
    (value) => Number.isInteger(value) && value >= 1 && value <= 20,
  );
  const scoreThreshold = parseNumber(
    '--threshold',
    retrieveDefaults.scoreThreshold,
    (value) => Number.isFinite(value) && value >= 0 && value <= 1,
  );
  const reportPath = await runRagEval({
    label: readArg('--label') ?? 'baseline',
    keepDataset: process.argv.includes('--keep-dataset'),
    config: {
      apiBaseUrl,
      chatModel: 'pending-health',
      embeddingModel: 'pending-health',
      numCtx: 1,
      numPredict: 1,
      temperature: 0,
      vectorBackend: 'pending-health',
      chunkStrategy: DEFAULT_CHUNK_CONFIG.strategy,
      chunkSize,
      overlap,
      topK,
      scoreThreshold,
      promptVersion: RAG_PROMPT_VERSION,
      selectedDatasets: selectDatasets(selectedDataset),
    },
  });
  process.stdout.write(`[rag-eval] 报告已生成：${reportPath}\n`);
}
