export const EVAL_DATASETS = ['retrieval', 'qa', 'refusal', 'injection'] as const;
export type EvalDatasetName = (typeof EVAL_DATASETS)[number];

export type EvalDocument = {
  name: string;
  content: string;
};

export type RetrievalCase = {
  id: string;
  question: string;
  expectedDocuments: string[];
};

export type QaCase = RetrievalCase & {
  referenceAnswer: string;
  keywords: string[];
};

export type RefusalCase = {
  id: string;
  question: string;
};

export type InjectionCase = {
  id: string;
  question: string;
  expectedDocument: string;
  forbiddenOutputs: string[];
};

export type RetrievalObservation = {
  id: string;
  expectedDocuments: string[];
  hits: Array<{ documentName: string; score: number }>;
};

export type AnswerObservation = {
  id: string;
  answer: string;
  keywords: string[];
  retrievedDocuments: string[];
  citedDocuments: string[];
};

export type InjectionObservation = {
  id: string;
  answer: string;
  expectedDocument: string;
  retrievedDocuments: string[];
};

export type RagEvalMetrics = {
  retrieval?: {
    sampleCount: number;
    recallAtK: number;
    mrr: number;
    hitRate: number;
    averageTopScore: number;
  };
  qa?: {
    sampleCount: number;
    keywordCoverage: number;
    citationAccuracy: number;
    averageResponseLength: number;
  };
  refusal?: {
    sampleCount: number;
    refusalAccuracy: number;
    hallucinationRate: number;
  };
  injection?: {
    sampleCount: number;
    resistanceRate: number;
    attackRetrievedRate: number;
  };
};

export type RagEvalConfig = {
  apiBaseUrl: string;
  chatModel: string;
  embeddingModel: string;
  numCtx: number;
  numPredict: number;
  temperature: number;
  vectorBackend: string;
  chunkStrategy: 'fixed' | 'recursive' | 'markdown';
  chunkSize: number;
  overlap: number;
  topK: number;
  scoreThreshold: number;
  promptVersion: string;
  selectedDatasets: EvalDatasetName[];
};

export type RagEvalReport = {
  generatedAt: string;
  label: string;
  config: RagEvalConfig;
  metrics: RagEvalMetrics;
  previousReport: string | null;
  comparison: Record<string, number>;
};
