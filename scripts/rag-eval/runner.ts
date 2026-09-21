import * as path from 'node:path';
import { RagEvalApiClient } from './api-client.js';
import {
  loadDocuments,
  loadInjectionCases,
  loadQaCases,
  loadRefusalCases,
  loadRetrievalCases,
} from './datasets.js';
import {
  calculateInjectionMetrics,
  calculateQaMetrics,
  calculateRefusalMetrics,
  calculateRetrievalMetrics,
  extractCitedDocuments,
} from './metrics.js';
import { writeRagEvalReport } from './report.js';
import type {
  AnswerObservation,
  EvalDatasetName,
  InjectionObservation,
  RagEvalConfig,
  RagEvalMetrics,
  RetrievalObservation,
} from './types.js';

export type RunOptions = {
  config: RagEvalConfig;
  label: string;
  keepDataset: boolean;
};

const progress = (message: string): void => {
  process.stdout.write(`[rag-eval] ${message}\n`);
};

export const runRagEval = async (options: RunOptions): Promise<string> => {
  const client = new RagEvalApiClient(options.config.apiBaseUrl);
  const health = await client.assertReady();
  const config: RagEvalConfig = {
    ...options.config,
    chatModel: health.chatModel,
    embeddingModel: health.embeddingModel,
    numCtx: health.numCtx,
    numPredict: health.numPredict,
    temperature: health.temperature,
    vectorBackend: health.vectorStore,
  };
  const documents = await loadDocuments();
  const dataset = await client.createDataset(`rag-eval-${Date.now()}`, {
    strategy: config.chunkStrategy,
    chunkSize: config.chunkSize,
    overlap: config.overlap,
  });

  try {
    progress(`开始索引 ${documents.length} 份固定评测文档`);
    for (const [index, document] of documents.entries()) {
      const created = await client.createDocument(dataset.id, document.name, document.content);
      await client.waitForDocument(created.id);
      progress(`已索引 ${index + 1}/${documents.length}`);
    }

    const metrics: RagEvalMetrics = {};
    if (config.selectedDatasets.includes('retrieval')) {
      metrics.retrieval = await runRetrieval(client, dataset.id, config);
      progress('检索指标完成');
    }
    if (config.selectedDatasets.includes('qa')) {
      metrics.qa = await runQa(client, dataset.id, config);
      progress('问答规则指标完成');
    }
    if (config.selectedDatasets.includes('refusal')) {
      metrics.refusal = await runRefusal(client, dataset.id, config);
      progress('拒答指标完成');
    }
    if (config.selectedDatasets.includes('injection')) {
      metrics.injection = await runInjection(client, dataset.id, config);
      progress('注入抵抗指标完成');
    }

    return writeRagEvalReport(
      {
        generatedAt: new Date().toISOString(),
        label: options.label,
        config,
        metrics,
      },
      path.resolve('scripts/rag-eval/reports'),
    );
  } finally {
    if (!options.keepDataset) {
      await client.deleteDataset(dataset.id);
    }
  }
};

const runRetrieval = async (
  client: RagEvalApiClient,
  datasetId: string,
  config: RagEvalConfig,
): Promise<NonNullable<RagEvalMetrics['retrieval']>> => {
  const cases = await loadRetrievalCases();
  const observations: RetrievalObservation[] = [];
  for (const item of cases) {
    const response = await client.retrieve(
      datasetId,
      item.question,
      config.topK,
      config.scoreThreshold,
    );
    observations.push({
      id: item.id,
      expectedDocuments: item.expectedDocuments,
      hits: response.hits.map((hit) => ({ documentName: hit.documentName, score: hit.score })),
    });
  }
  return calculateRetrievalMetrics(observations);
};

const runQa = async (
  client: RagEvalApiClient,
  datasetId: string,
  config: RagEvalConfig,
): Promise<NonNullable<RagEvalMetrics['qa']>> => {
  const cases = await loadQaCases();
  const observations: AnswerObservation[] = [];
  for (const item of cases) {
    const response = await client.answer(
      datasetId,
      item.question,
      config.topK,
      config.scoreThreshold,
    );
    const retrievedDocuments = response.citations.map((hit) => hit.documentName);
    observations.push({
      id: item.id,
      answer: response.answer,
      keywords: item.keywords,
      retrievedDocuments,
      citedDocuments: extractCitedDocuments(response.answer, retrievedDocuments),
    });
  }
  return calculateQaMetrics(observations);
};

const runRefusal = async (
  client: RagEvalApiClient,
  datasetId: string,
  config: RagEvalConfig,
): Promise<NonNullable<RagEvalMetrics['refusal']>> => {
  const cases = await loadRefusalCases();
  const answers = new Map<string, string>();
  for (const item of cases) {
    const response = await client.answer(
      datasetId,
      item.question,
      config.topK,
      config.scoreThreshold,
    );
    answers.set(item.id, response.answer);
  }
  return calculateRefusalMetrics(cases, answers);
};

const runInjection = async (
  client: RagEvalApiClient,
  datasetId: string,
  config: RagEvalConfig,
): Promise<NonNullable<RagEvalMetrics['injection']>> => {
  const cases = await loadInjectionCases();
  const observations = new Map<string, InjectionObservation>();
  for (const item of cases) {
    const response = await client.answer(
      datasetId,
      item.question,
      config.topK,
      config.scoreThreshold,
    );
    observations.set(item.id, {
      id: item.id,
      answer: response.answer,
      expectedDocument: item.expectedDocument,
      retrievedDocuments: response.citations.map((hit) => hit.documentName),
    });
  }
  return calculateInjectionMetrics(cases, observations);
};

export const selectDatasets = (selected: EvalDatasetName | undefined): EvalDatasetName[] =>
  selected ? [selected] : ['retrieval', 'qa', 'refusal', 'injection'];
