import { ModelCapabilitySchema, type ModelCapability, type ModelId } from '@ai-engine/contracts';
import { ModelNotFoundError } from './llm-errors';

const SOURCE_REPORT = 'scripts/model-baseline/reports/2026-08-26-baseline.md';

const CAPABILITIES: Record<string, ModelCapability> = {
  'qwen3.5:2b': ModelCapabilitySchema.parse({
    id: 'qwen3.5:2b',
    supportsTools: true,
    supportsVision: false,
    supportsJsonMode: true,
    // 合法 JSON 率全程 1.0；6 工具仍全指标 1.0。出处：报告「工具调用阶梯」。
    needsToolCallFallback: false,
    maxToolCount: 6,
    // 与默认 numCtx 对齐。32k 窗口下 17240 prompt tokens 仍 100% 召回，但延迟约 14s。
    effectiveContextTokens: 8192,
    sourceReport: SOURCE_REPORT,
  }),
  'gemma4:e2b': ModelCapabilitySchema.parse({
    id: 'gemma4:e2b',
    supportsTools: true,
    supportsVision: false,
    supportsJsonMode: true,
    // A/C 合法 JSON 与选择正确率均为 1.0，G 假阳性 0。未测 B/D/E/F，不外推 12 工具或嵌套参数。
    needsToolCallFallback: false,
    maxToolCount: 6,
    effectiveContextTokens: 8192,
    sourceReport: 'scripts/model-baseline/reports/2026-08-28-gemma-tool-call.md',
  }),
  'nomic-embed-text:latest': ModelCapabilitySchema.parse({
    id: 'nomic-embed-text:latest',
    supportsTools: false,
    supportsVision: false,
    supportsJsonMode: false,
    needsToolCallFallback: false,
    maxToolCount: 0,
    effectiveContextTokens: 8192,
    embeddingDimension: 768,
    sourceReport: SOURCE_REPORT,
  }),
};

export const getModelCapability = (modelId: ModelId): ModelCapability => {
  const capability = CAPABILITIES[modelId];
  if (!capability) throw new ModelNotFoundError(modelId);
  return capability;
};

export const findModelCapability = (modelId: ModelId): ModelCapability | null =>
  CAPABILITIES[modelId] ?? null;

export const listEvaluatedModelCapabilities = (): ModelCapability[] =>
  Object.values(CAPABILITIES).filter((capability) => capability.embeddingDimension === undefined);
