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
    supportsTools: false,
    supportsVision: false,
    supportsJsonMode: true,
    needsToolCallFallback: true,
    maxToolCount: 0,
    effectiveContextTokens: 8192,
    sourceReport: SOURCE_REPORT,
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
