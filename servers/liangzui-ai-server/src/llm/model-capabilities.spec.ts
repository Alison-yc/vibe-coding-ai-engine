import { describe, expect, it } from 'vitest';
import { getModelCapability } from './model-capabilities';

describe('模型能力表', () => {
  it('qwen3.5:2b 的数值能在 2026-08-26 基线报告里对上', () => {
    const capability = getModelCapability('qwen3.5:2b');
    expect(capability).toMatchObject({
      supportsTools: true,
      supportsJsonMode: true,
      needsToolCallFallback: false,
      maxToolCount: 6,
      effectiveContextTokens: 8192,
      sourceReport: 'scripts/model-baseline/reports/2026-08-26-baseline.md',
    });
  });

  it('未知模型抛出 ModelNotFoundError', () => {
    expect(() => getModelCapability('missing-model')).toThrow('missing-model');
  });
});
