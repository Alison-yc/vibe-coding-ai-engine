import type { BaselineOllamaClient } from '../ollama-client.js';
import type { BaselineOptions, BaselineRow, BaselineSection } from '../types.js';

const PROMPT = '用中文简要说明为什么本地运行小模型有助于保护隐私，控制在 100 字以内。';

export const runLatencyCase = async (
  client: BaselineOllamaClient,
  options: BaselineOptions,
): Promise<BaselineSection> => {
  const sampleCount = options.samples ?? 3;
  const rows: BaselineRow[] = [];
  for (const model of [options.model, options.largeModel]) {
    for (const mode of ['cold', 'warm'] as const) {
      let firstTokenMs = 0;
      let totalDurationMs = 0;
      let tokensPerSecond = 0;
      for (let sample = 0; sample < sampleCount; sample += 1) {
        if (mode === 'cold') {
          await client.chat({
            model,
            messages: [{ role: 'user', content: '卸载探针' }],
            numPredict: 1,
            keepAlive: 0,
          });
        }
        const metrics = await client.streamProbe({
          model,
          prompt: PROMPT,
          keepAlive: mode === 'cold' ? 0 : '10m',
        });
        firstTokenMs += metrics.firstTokenMs;
        totalDurationMs += metrics.totalDurationMs;
        tokensPerSecond += metrics.tokensPerSecond;
      }
      rows.push({
        id: `${model}-${mode}`,
        metrics: {
          model,
          mode,
          samples: sampleCount,
          averageFirstTokenMs: Math.round(firstTokenMs / sampleCount),
          averageTotalDurationMs: Math.round(totalDurationMs / sampleCount),
          averageTokensPerSecond: Number((tokensPerSecond / sampleCount).toFixed(2)),
        },
      });
    }
  }

  for (const numPredict of [128, 256, 512, 1024]) {
    const result = await client.chat({
      model: options.model,
      messages: [
        {
          role: 'user',
          content: '写一篇约 600 字的中文短文，最后必须输出标记 <END>。不要提前输出这个标记。',
        },
      ],
      numPredict,
    });
    rows.push({
      id: `num-predict-${numPredict}`,
      metrics: {
        model: options.model,
        mode: 'output-cap',
        samples: 1,
        averageFirstTokenMs: null,
        averageTotalDurationMs: result.totalDurationMs,
        averageTokensPerSecond: null,
        numPredict,
        outputTokens: result.outputTokens,
        completed: result.content.includes('<END>'),
      },
    });
  }

  const concurrentStartedAt = performance.now();
  await Promise.all([
    client.streamProbe({ model: options.model, prompt: PROMPT, keepAlive: '10m' }),
    client.streamProbe({ model: options.largeModel, prompt: PROMPT, keepAlive: '10m' }),
  ]);
  rows.push({
    id: 'two-model-concurrent',
    metrics: {
      model: `${options.model} + ${options.largeModel}`,
      mode: 'concurrent',
      samples: 1,
      averageFirstTokenMs: null,
      averageTotalDurationMs: Math.round(performance.now() - concurrentStartedAt),
      averageTokensPerSecond: null,
    },
  });

  return {
    caseName: 'latency',
    title: '延迟与吞吐',
    columns: [
      'model',
      'mode',
      'samples',
      'averageFirstTokenMs',
      'averageTotalDurationMs',
      'averageTokensPerSecond',
      'numPredict',
      'outputTokens',
      'completed',
    ],
    rows,
    conclusions: [
      'chat 超时至少覆盖 qwen 冷启动总耗时；stream 首 token 超时至少覆盖 qwen 冷启动首 token P50 的两倍。',
      'gemma4:e2b 只作为显式备选，不参与默认请求链。',
    ],
  };
};
