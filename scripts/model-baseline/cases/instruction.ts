import type { BaselineOllamaClient } from '../ollama-client.js';
import type { BaselineOptions, BaselineRow, BaselineSection } from '../types.js';

type InstructionCase = {
  id: string;
  prompt: string;
  validate: (value: string) => boolean;
};

const JSON_ONLY = /^(?:\{[\s\S]*\}|\[[\s\S]*\])$/u;

const CASES: InstructionCase[] = [
  {
    id: 'translation-only',
    prompt: '把“今天天气很好”翻译成英文。只输出翻译结果，不要解释。',
    validate: (value) => value.trim().toLowerCase() === 'the weather is nice today.',
  },
  {
    id: 'ten-chars',
    prompt: '用不超过 10 个汉字回答：为什么要写测试？',
    validate: (value) => [...value.trim()].length <= 10,
  },
  {
    id: 'json-only',
    prompt: '只输出 JSON，不要代码块：{"sentiment":"positive"}',
    validate: (value) => {
      try {
        const parsed: unknown = JSON.parse(value);
        return (
          typeof parsed === 'object' &&
          parsed !== null &&
          'sentiment' in parsed &&
          parsed.sentiment === 'positive'
        );
      } catch {
        return false;
      }
    },
  },
  {
    id: 'single-word',
    prompt: '判断“我很开心”的情绪。只能回答：积极、消极、中性。',
    validate: (value) => ['积极', '消极', '中性'].includes(value.trim()),
  },
  {
    id: 'number-only',
    prompt: '计算 17 + 25。只输出阿拉伯数字。',
    validate: (value) => value.trim() === '42',
  },
  {
    id: 'fixed-prefix',
    prompt: '用“结论：”开头，用一句话说明 TypeScript 的价值。',
    validate: (value) => value.trim().startsWith('结论：') && value.trim().split('\n').length === 1,
  },
  {
    id: 'two-items',
    prompt: '列出两个 HTTP 方法，每行一个，不要编号，不要其他文字。',
    validate: (value) => value.trim().split('\n').filter(Boolean).length === 2,
  },
  {
    id: 'lowercase',
    prompt: '把 HELLO WORLD 转为小写，只输出结果。',
    validate: (value) => value.trim() === 'hello world',
  },
  {
    id: 'extract-email',
    prompt: '从“联系 alice@example.com 获取帮助”中提取邮箱，只输出邮箱。',
    validate: (value) => value.trim() === 'alice@example.com',
  },
  {
    id: 'boolean',
    prompt: '命题“2 大于 1”是否正确？只输出 true 或 false。',
    validate: (value) => value.trim() === 'true',
  },
  {
    id: 'csv',
    prompt: '把苹果、香蕉、橙子输出为英文 CSV 单行，不要空格和解释。',
    validate: (value) => value.trim().toLowerCase() === 'apple,banana,orange',
  },
  {
    id: 'quoted',
    prompt: '复述“安全第一”，必须包含中文引号且不要添加其他内容。',
    validate: (value) => value.trim() === '“安全第一”',
  },
  {
    id: 'uppercase',
    prompt: '把 api 转为大写，只输出结果。',
    validate: (value) => value.trim() === 'API',
  },
  {
    id: 'date-format',
    prompt: '把 2026年8月26日 转成 YYYY-MM-DD，只输出结果。',
    validate: (value) => value.trim() === '2026-08-26',
  },
  {
    id: 'markdown-forbidden',
    prompt: '只输出 JSON 数组 ["a","b"]，不要 markdown 代码块。',
    validate: (value) => JSON_ONLY.test(value.trim()) && !value.includes('```'),
  },
  {
    id: 'exact-copy',
    prompt: '原样输出 token_ABC-123，不要解释。',
    validate: (value) => value.trim() === 'token_ABC-123',
  },
  {
    id: 'three-words',
    prompt: '用恰好三个英文单词描述人工智能，只输出这三个词。',
    validate: (value) => value.trim().split(/\s+/u).length === 3,
  },
  {
    id: 'no-punctuation',
    prompt: '回答中国的首都，不能包含标点符号。',
    validate: (value) => value.trim() === '北京',
  },
  {
    id: 'xml',
    prompt: '只输出 <answer>42</answer>，不要解释。',
    validate: (value) => value.trim() === '<answer>42</answer>',
  },
  {
    id: 'empty-when-unknown',
    prompt: '如果无法从问题中得知姓名则只输出 UNKNOWN。问题：这个人是谁？',
    validate: (value) => value.trim() === 'UNKNOWN',
  },
];

const excerpt = (value: string): string => value.replace(/\s+/gu, ' ').trim().slice(0, 160);

export const runInstructionCase = async (
  client: BaselineOllamaClient,
  options: BaselineOptions,
): Promise<BaselineSection> => {
  const sampleCount = options.samples ?? 5;
  const rows: BaselineRow[] = [];
  for (const testCase of CASES) {
    let passed = 0;
    let sampleResponse = '';
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const result = await client.chat({
        model: options.model,
        messages: [{ role: 'user', content: testCase.prompt }],
      });
      sampleResponse ||= result.content;
      if (testCase.validate(result.content)) passed += 1;
    }
    rows.push({
      id: testCase.id,
      metrics: {
        passed,
        samples: sampleCount,
        complianceRate: Number((passed / sampleCount).toFixed(3)),
      },
      responseExcerpt: excerpt(sampleResponse),
    });
  }

  const totalPassed = rows.reduce((sum, row) => sum + Number(row.metrics.passed), 0);
  const totalSamples = CASES.length * sampleCount;
  return {
    caseName: 'instruction',
    title: '中文指令遵循',
    columns: ['passed', 'samples', 'complianceRate'],
    rows,
    conclusions: [
      `整体格式合规率为 ${((totalPassed / totalSamples) * 100).toFixed(1)}%。`,
      '响应样本仅保留前 160 字符，测评脚本不打印完整模型响应。',
    ],
  };
};
