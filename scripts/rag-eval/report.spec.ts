import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareReportFiles, writeRagEvalReport } from './report.js';
import type { RagEvalConfig, RagEvalReport } from './types.js';

const config: RagEvalConfig = {
  apiBaseUrl: 'http://localhost:3000',
  chatModel: 'qwen3.5:2b',
  embeddingModel: 'nomic-embed-text:latest',
  numCtx: 8192,
  numPredict: 2048,
  temperature: 0.2,
  vectorBackend: 'in-memory',
  chunkStrategy: 'recursive',
  chunkSize: 500,
  overlap: 50,
  topK: 3,
  scoreThreshold: 0.3,
  promptVersion: 'rag-v1-delimiter-escaped',
  selectedDatasets: ['refusal'],
};

const baseReport = (): Omit<RagEvalReport, 'previousReport' | 'comparison'> => ({
  generatedAt: '2026-08-27T09:17:21.659Z',
  label: 'baseline',
  config,
  metrics: {
    refusal: { sampleCount: 15, refusalAccuracy: 1, hallucinationRate: 0 },
  },
});

describe('RAG 评测报告', () => {
  it('写入配置快照，并在第二次运行时给出拒答指标差值', async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), 'rag-eval-'));
    try {
      const first = await writeRagEvalReport(baseReport(), outputDir);
      const second = await writeRagEvalReport(
        {
          ...baseReport(),
          generatedAt: '2026-08-27T10:00:00.000Z',
          metrics: {
            refusal: { sampleCount: 15, refusalAccuracy: 0.8, hallucinationRate: 0.2 },
          },
        },
        outputDir,
      );
      const comparison = await compareReportFiles(first, second);
      expect(comparison).toContain('refusal.refusalAccuracy: -0.2000');
      expect(comparison).toContain('refusal.hallucinationRate: +0.2000');
      expect(await readFile(second, 'utf8')).toContain('目录内上一份报告');
      expect(await readFile(second, 'utf8')).toContain('pnpm rag-eval:compare');
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
