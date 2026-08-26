import type { OllamaTool } from '../ollama-client.js';
import type { BaselineOllamaClient } from '../ollama-client.js';
import type { BaselineOptions, BaselineRow, BaselineSection } from '../types.js';

type ToolFixture = {
  tool: OllamaTool;
  prompt: string;
  expectedArguments: Record<string, unknown>;
};

const stringObject = (name: string): Record<string, unknown> => ({
  type: 'object',
  properties: { [name]: { type: 'string' } },
  required: [name],
});

const FIXTURES: ToolFixture[] = [
  {
    tool: {
      type: 'function',
      function: {
        name: 'get_weather',
        description: '查询指定城市的天气',
        parameters: stringObject('city'),
      },
    },
    prompt: '查询北京的天气。',
    expectedArguments: { city: '北京' },
  },
  {
    tool: {
      type: 'function',
      function: {
        name: 'calculate',
        description: '计算数学表达式',
        parameters: stringObject('expression'),
      },
    },
    prompt: '计算 17 + 25。',
    expectedArguments: { expression: '17 + 25' },
  },
  {
    tool: {
      type: 'function',
      function: {
        name: 'read_file',
        description: '读取工作区内文件',
        parameters: stringObject('path'),
      },
    },
    prompt: '读取 docs/readme.md。',
    expectedArguments: { path: 'docs/readme.md' },
  },
  {
    tool: {
      type: 'function',
      function: {
        name: 'search_files',
        description: '搜索文件内容',
        parameters: stringObject('query'),
      },
    },
    prompt: '在文件中搜索 LlmGateway。',
    expectedArguments: { query: 'LlmGateway' },
  },
  {
    tool: {
      type: 'function',
      function: {
        name: 'list_directory',
        description: '列出目录中的文件',
        parameters: stringObject('path'),
      },
    },
    prompt: '列出 packages 目录。',
    expectedArguments: { path: 'packages' },
  },
  {
    tool: {
      type: 'function',
      function: {
        name: 'get_time',
        description: '获取指定时区当前时间',
        parameters: stringObject('timezone'),
      },
    },
    prompt: '查询 Asia/Shanghai 当前时间。',
    expectedArguments: { timezone: 'Asia/Shanghai' },
  },
  {
    tool: {
      type: 'function',
      function: {
        name: 'translate_text',
        description: '翻译文字',
        parameters: stringObject('text'),
      },
    },
    prompt: '翻译“你好”。',
    expectedArguments: { text: '你好' },
  },
  {
    tool: {
      type: 'function',
      function: {
        name: 'lookup_definition',
        description: '查询单词定义',
        parameters: stringObject('word'),
      },
    },
    prompt: '查询单词 resilient 的定义。',
    expectedArguments: { word: 'resilient' },
  },
  {
    tool: {
      type: 'function',
      function: {
        name: 'convert_currency',
        description: '换算货币',
        parameters: stringObject('amount'),
      },
    },
    prompt: '把 100 USD 换算为 CNY。',
    expectedArguments: { amount: '100 USD to CNY' },
  },
  {
    tool: {
      type: 'function',
      function: {
        name: 'create_note',
        description: '创建文本笔记',
        parameters: stringObject('content'),
      },
    },
    prompt: '创建内容为“复习 TypeScript”的笔记。',
    expectedArguments: { content: '复习 TypeScript' },
  },
  {
    tool: {
      type: 'function',
      function: {
        name: 'hash_text',
        description: '计算文字哈希',
        parameters: stringObject('text'),
      },
    },
    prompt: '计算 abc 的哈希。',
    expectedArguments: { text: 'abc' },
  },
  {
    tool: {
      type: 'function',
      function: {
        name: 'fetch_public_url',
        description: '读取公开网页',
        parameters: stringObject('url'),
      },
    },
    prompt: '读取 https://example.com。',
    expectedArguments: { url: 'https://example.com' },
  },
];

const scenarios = [
  { id: 'A-1-tool', count: 1 },
  { id: 'B-3-tools', count: 3 },
  { id: 'C-6-tools', count: 6 },
  { id: 'D-12-tools', count: 12 },
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const argumentsMatch = (actual: unknown, expected: Record<string, unknown>): boolean => {
  if (!isRecord(actual)) return false;
  return Object.entries(expected).every(
    ([key, value]) =>
      typeof actual[key] === 'string' &&
      typeof value === 'string' &&
      actual[key].toLowerCase().includes(value.toLowerCase()),
  );
};

export const runToolCallCase = async (
  client: BaselineOllamaClient,
  options: BaselineOptions,
): Promise<BaselineSection> => {
  const sampleCount = options.samples ?? 3;
  const rows: BaselineRow[] = [];

  for (const scenario of scenarios) {
    let legal = 0;
    let selected = 0;
    let argumentsCorrect = 0;
    const total = 20 * sampleCount;
    for (let index = 0; index < 20; index += 1) {
      const expected = FIXTURES[index % scenario.count];
      if (!expected) throw new Error(`工具场景 ${scenario.id} 缺少 fixture`);
      for (let sample = 0; sample < sampleCount; sample += 1) {
        const result = await client.chat({
          model: options.model,
          messages: [{ role: 'user', content: expected.prompt }],
          tools: FIXTURES.slice(0, scenario.count).map((fixture) => fixture.tool),
        });
        const call = result.toolCalls[0]?.function;
        if (typeof call?.name === 'string' && isRecord(call.arguments)) legal += 1;
        if (call?.name === expected.tool.function.name) selected += 1;
        if (
          call?.name === expected.tool.function.name &&
          argumentsMatch(call.arguments, expected.expectedArguments)
        ) {
          argumentsCorrect += 1;
        }
      }
    }
    rows.push({
      id: scenario.id,
      metrics: {
        tools: scenario.count,
        samples: total,
        legalJsonRate: Number((legal / total).toFixed(3)),
        selectionRate: Number((selected / total).toFixed(3)),
        argumentRate: Number((argumentsCorrect / total).toFixed(3)),
        falsePositiveRate: 0,
      },
    });
  }

  let multiStepCorrect = 0;
  const multiStepTotal = 20 * sampleCount;
  const multiStepTools = [FIXTURES[0]?.tool, FIXTURES[1]?.tool, FIXTURES[9]?.tool].filter(
    (tool): tool is OllamaTool => tool !== undefined,
  );
  for (let index = 0; index < multiStepTotal; index += 1) {
    const prompt = '查询北京天气，然后把天气结果创建成一条笔记。';
    const first = await client.chat({
      model: options.model,
      messages: [{ role: 'user', content: prompt }],
      tools: multiStepTools,
    });
    const firstCall = first.toolCalls[0]?.function;
    if (firstCall?.name !== 'get_weather') continue;
    const second = await client.chat({
      model: options.model,
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: '', tool_calls: first.toolCalls },
        { role: 'tool', tool_name: 'get_weather', content: '{"weather":"晴，25℃"}' },
      ],
      tools: multiStepTools,
    });
    if (second.toolCalls[0]?.function?.name === 'create_note') multiStepCorrect += 1;
  }
  rows.push({
    id: 'E-3-tools-two-steps',
    metrics: {
      tools: 3,
      samples: multiStepTotal,
      legalJsonRate: Number((multiStepCorrect / multiStepTotal).toFixed(3)),
      selectionRate: Number((multiStepCorrect / multiStepTotal).toFixed(3)),
      argumentRate: null,
      falsePositiveRate: 0,
    },
  });

  const nestedTool: OllamaTool = {
    type: 'function',
    function: {
      name: 'create_task',
      description: '创建带负责人和标签的任务',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              assignee: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['title', 'assignee', 'tags'],
          },
        },
        required: ['task'],
      },
    },
  };
  let nestedCorrect = 0;
  const nestedTotal = 20 * sampleCount;
  for (let index = 0; index < nestedTotal; index += 1) {
    const result = await client.chat({
      model: options.model,
      messages: [
        {
          role: 'user',
          content: '创建任务“修复登录”，负责人 alice，标签 bug 和 urgent。',
        },
      ],
      tools: [nestedTool, ...FIXTURES.slice(0, 2).map((fixture) => fixture.tool)],
    });
    const args = result.toolCalls[0]?.function?.arguments;
    if (
      result.toolCalls[0]?.function?.name === 'create_task' &&
      isRecord(args) &&
      isRecord(args.task) &&
      args.task.title === '修复登录' &&
      args.task.assignee === 'alice' &&
      Array.isArray(args.task.tags)
    ) {
      nestedCorrect += 1;
    }
  }
  rows.push({
    id: 'F-3-tools-nested',
    metrics: {
      tools: 3,
      samples: nestedTotal,
      legalJsonRate: Number((nestedCorrect / nestedTotal).toFixed(3)),
      selectionRate: Number((nestedCorrect / nestedTotal).toFixed(3)),
      argumentRate: Number((nestedCorrect / nestedTotal).toFixed(3)),
      falsePositiveRate: 0,
    },
  });

  const noToolPrompts = Array.from(
    { length: 20 },
    (_, index) => `这是普通对话 ${index + 1}：用一句话鼓励正在学习编程的人，不要调用工具。`,
  );
  let falsePositives = 0;
  for (const prompt of noToolPrompts) {
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const result = await client.chat({
        model: options.model,
        messages: [{ role: 'user', content: prompt }],
        tools: FIXTURES.slice(0, 3).map((fixture) => fixture.tool),
      });
      if (result.toolCalls.length > 0) falsePositives += 1;
    }
  }
  const noToolTotal = noToolPrompts.length * sampleCount;
  rows.push({
    id: 'G-no-tool',
    metrics: {
      tools: 3,
      samples: noToolTotal,
      legalJsonRate: null,
      selectionRate: null,
      argumentRate: null,
      falsePositiveRate: Number((falsePositives / noToolTotal).toFixed(3)),
    },
  });

  return {
    caseName: 'tool-call',
    title: '工具调用阶梯',
    columns: [
      'tools',
      'samples',
      'legalJsonRate',
      'selectionRate',
      'argumentRate',
      'falsePositiveRate',
    ],
    rows,
    conclusions: [
      'maxToolCount 取选择正确率仍不低于 70% 的最大工具数量。',
      '嵌套参数单列，不用简单工具的成功率掩盖复杂 schema 失败。',
    ],
  };
};
