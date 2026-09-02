import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { runContextCase } from './cases/context.js';
import { runEmbeddingCase } from './cases/embedding.js';
import { runInstructionCase } from './cases/instruction.js';
import { runLatencyCase } from './cases/latency.js';
import { runStructuredCase } from './cases/structured.js';
import { runToolCallCase } from './cases/tool-call.js';
import { BaselineOllamaClient } from './ollama-client.js';
import { writeBaselineReport } from './report.js';
import type {
  BaselineCaseName,
  BaselineOptions,
  BaselineReport,
  BaselineSection,
} from './types.js';

const runners: Record<
  BaselineCaseName,
  (client: BaselineOllamaClient, options: BaselineOptions) => Promise<BaselineSection>
> = {
  instruction: runInstructionCase,
  'tool-call': runToolCallCase,
  structured: runStructuredCase,
  context: runContextCase,
  latency: runLatencyCase,
  embedding: runEmbeddingCase,
};

const checkpointPath = (options: BaselineOptions): string =>
  path.join(options.outputDir, '.baseline-checkpoint.json');

const readCheckpoint = async (options: BaselineOptions): Promise<BaselineSection[]> => {
  try {
    const value: unknown = JSON.parse(await readFile(checkpointPath(options), 'utf8'));
    if (!Array.isArray(value)) return [];
    const items: unknown[] = value;
    return items.filter(
      (item): item is BaselineSection =>
        typeof item === 'object' &&
        item !== null &&
        'caseName' in item &&
        typeof item.caseName === 'string' &&
        'rows' in item &&
        Array.isArray(item.rows),
    );
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
};

export const runBaseline = async (options: BaselineOptions): Promise<string> => {
  const client = new BaselineOllamaClient(options.baseUrl);
  await client.version();
  await mkdir(options.outputDir, { recursive: true });
  const existing = await readCheckpoint(options);
  const sections = existing.filter(
    (section) =>
      options.selectedCases.includes(section.caseName) &&
      !(options.force && options.selectedCases.includes(section.caseName)),
  );

  for (const caseName of options.selectedCases) {
    if (sections.some((section) => section.caseName === caseName)) {
      process.stdout.write(`[baseline] 跳过已完成项：${caseName}\n`);
      continue;
    }
    process.stdout.write(`[baseline] 开始：${caseName}\n`);
    const section = await runners[caseName](client, options);
    sections.push(section);
    await writeFile(checkpointPath(options), JSON.stringify(sections, null, 2), 'utf8');
    process.stdout.write(`[baseline] 完成：${caseName}\n`);
  }

  const report: BaselineReport = {
    generatedAt: new Date().toISOString(),
    environment: {
      ollamaVersion: await client.version(),
      model: options.model,
      modelDigest: await client.digest(options.model),
      largeModel: options.largeModel,
      largeModelDigest: await client.digest(options.largeModel),
      embedModel: options.embedModel,
      embedModelDigest: await client.digest(options.embedModel),
      hardware: `${os.cpus()[0]?.model ?? os.arch()} / ${Math.round(os.totalmem() / 1024 ** 3)} GB`,
    },
    sections,
    ...(options.reportSlug ? { slug: options.reportSlug } : {}),
  };
  return writeBaselineReport(report, options.outputDir);
};
