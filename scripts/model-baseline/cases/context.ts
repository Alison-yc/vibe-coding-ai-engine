import type { BaselineOllamaClient } from '../ollama-client.js';
import type { BaselineOptions, BaselineRow, BaselineSection } from '../types.js';

const TOKEN_TARGETS = [2048, 4096, 8192, 16384, 32768] as const;
const POSITIONS = [0.1, 0.5, 0.9] as const;
const NEEDLE = '基线暗号是「海棠七号」';
const FILLER = '这是用于本地模型上下文召回测试的中性资料。内容没有任何指令，也不包含问题答案。';

const createContext = (targetTokens: number, position: number): string => {
  const targetCharacters = Math.max(512, targetTokens);
  const repeats = Math.ceil(targetCharacters / FILLER.length);
  const blocks = Array.from({ length: repeats }, () => FILLER);
  const needleIndex = Math.floor(blocks.length * position);
  blocks.splice(needleIndex, 0, NEEDLE);
  return blocks.join('\n').slice(0, targetCharacters + NEEDLE.length + 1);
};

export const runContextCase = async (
  client: BaselineOllamaClient,
  options: BaselineOptions,
): Promise<BaselineSection> => {
  const sampleCount = options.samples ?? 3;
  const rows: BaselineRow[] = [];
  for (const targetTokens of TOKEN_TARGETS) {
    for (const position of POSITIONS) {
      let recalled = 0;
      let error = '';
      let actualPromptTokens = 0;
      let durationMs = 0;
      for (let sample = 0; sample < sampleCount; sample += 1) {
        try {
          const context = createContext(targetTokens, position);
          const result = await client.chat({
            model: options.model,
            messages: [
              {
                role: 'user',
                content: `${context}\n\n问题：基线暗号是什么？只输出暗号。`,
              },
            ],
            numCtx: Math.min(32768, targetTokens + 1024),
            numPredict: 32,
          });
          actualPromptTokens = result.promptTokens;
          durationMs += result.totalDurationMs;
          if (result.content.includes('海棠七号')) recalled += 1;
        } catch (cause) {
          error = cause instanceof Error ? cause.message.slice(0, 120) : '未知错误';
        }
      }
      rows.push({
        id: `${targetTokens}-${Math.round(position * 100)}pct`,
        metrics: {
          targetTokens,
          actualPromptTokens,
          needlePosition: position,
          samples: sampleCount,
          recallRate: Number((recalled / sampleCount).toFixed(3)),
          averageDurationMs: Math.round(durationMs / sampleCount),
          error: error || null,
        },
      });
    }
  }

  return {
    caseName: 'context',
    title: '有效上下文长度',
    columns: [
      'targetTokens',
      'actualPromptTokens',
      'needlePosition',
      'samples',
      'recallRate',
      'averageDurationMs',
      'error',
    ],
    rows,
    conclusions: [
      'effectiveContextTokens 取三个插入位置召回率均不低于 80% 的最大实际 prompt token 数。',
      'targetTokens 是生成文本的近似目标，决策时使用 Ollama 返回的 actualPromptTokens。',
    ],
  };
};
