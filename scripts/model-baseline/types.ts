export const BASELINE_CASES = [
  'instruction',
  'tool-call',
  'structured',
  'context',
  'latency',
  'embedding',
] as const;

export type BaselineCaseName = (typeof BASELINE_CASES)[number];

export type BaselineOptions = {
  baseUrl: string;
  model: string;
  largeModel: string;
  embedModel: string;
  samples: number | null;
  selectedCases: BaselineCaseName[];
  outputDir: string;
  force: boolean;
};

export type MetricValue = string | number | boolean | null;

export type BaselineRow = {
  id: string;
  metrics: Record<string, MetricValue>;
  responseExcerpt?: string;
};

export type BaselineSection = {
  caseName: BaselineCaseName;
  title: string;
  columns: string[];
  rows: BaselineRow[];
  conclusions: string[];
};

export type ModelEnvironment = {
  ollamaVersion: string;
  model: string;
  modelDigest: string;
  largeModel: string;
  largeModelDigest: string;
  embedModel: string;
  embedModelDigest: string;
  hardware: string;
};

export type BaselineReport = {
  generatedAt: string;
  environment: ModelEnvironment;
  sections: BaselineSection[];
};
