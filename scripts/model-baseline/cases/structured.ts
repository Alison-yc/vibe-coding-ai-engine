import type { BaselineOllamaClient } from '../ollama-client.js';
import type { BaselineOptions, BaselineRow, BaselineSection } from '../types.js';

const schemas = [
  {
    id: '3-fields',
    schema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        priority: { type: 'integer' },
        approved: { type: 'boolean' },
      },
      required: ['category', 'priority', 'approved'],
    },
    validate: (value: Record<string, unknown>) =>
      typeof value.category === 'string' &&
      typeof value.priority === 'number' &&
      typeof value.approved === 'boolean',
  },
  {
    id: '8-fields',
    schema: {
      type: 'object',
      properties: Object.fromEntries(
        ['title', 'summary', 'owner', 'status', 'risk', 'dueDate', 'language', 'source'].map(
          (key) => [key, { type: 'string' }],
        ),
      ),
      required: ['title', 'summary', 'owner', 'status', 'risk', 'dueDate', 'language', 'source'],
    },
    validate: (value: Record<string, unknown>) =>
      ['title', 'summary', 'owner', 'status', 'risk', 'dueDate', 'language', 'source'].every(
        (key) => typeof value[key] === 'string',
      ),
  },
  {
    id: 'array',
    schema: {
      type: 'object',
      properties: {
        keywords: { type: 'array', items: { type: 'string' } },
        scores: { type: 'array', items: { type: 'number' } },
      },
      required: ['keywords', 'scores'],
    },
    validate: (value: Record<string, unknown>) =>
      Array.isArray(value.keywords) &&
      value.keywords.every((item) => typeof item === 'string') &&
      Array.isArray(value.scores) &&
      value.scores.every((item) => typeof item === 'number'),
  },
  {
    id: 'nested',
    schema: {
      type: 'object',
      properties: {
        task: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            assignee: {
              type: 'object',
              properties: { name: { type: 'string' }, team: { type: 'string' } },
              required: ['name', 'team'],
            },
          },
          required: ['title', 'assignee'],
        },
      },
      required: ['task'],
    },
    validate: (value: Record<string, unknown>) => {
      const task = value.task;
      if (typeof task !== 'object' || task === null || Array.isArray(task)) return false;
      if (!('title' in task) || typeof task.title !== 'string') return false;
      if (!('assignee' in task)) return false;
      const assignee = task.assignee;
      return (
        typeof assignee === 'object' &&
        assignee !== null &&
        !Array.isArray(assignee) &&
        'name' in assignee &&
        typeof assignee.name === 'string' &&
        'team' in assignee &&
        typeof assignee.team === 'string'
      );
    },
  },
] as const;

const parseObject = (value: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return Object.fromEntries(Object.entries(parsed));
  } catch {
    return null;
  }
};

export const runStructuredCase = async (
  client: BaselineOllamaClient,
  options: BaselineOptions,
): Promise<BaselineSection> => {
  const sampleCount = options.samples ?? 3;
  const rows: BaselineRow[] = [];
  for (const fixture of schemas) {
    for (const method of ['json-mode', 'prompt-only', 'few-shot'] as const) {
      let valid = 0;
      let excerpt = '';
      for (let sample = 0; sample < sampleCount; sample += 1) {
        const prompt =
          method === 'few-shot'
            ? `示例：输入“低风险”输出 {"category":"task"}。现在把“修复登录问题，负责人 alice”按这个 JSON Schema 输出，只输出 JSON：${JSON.stringify(fixture.schema)}`
            : `把“修复登录问题，负责人 alice”按这个 JSON Schema 输出，只输出 JSON：${JSON.stringify(fixture.schema)}`;
        const result = await client.chat({
          model: options.model,
          messages: [{ role: 'user', content: prompt }],
          format: method === 'json-mode' ? fixture.schema : undefined,
        });
        excerpt ||= result.content.replace(/\s+/gu, ' ').slice(0, 160);
        const parsed = parseObject(result.content);
        if (parsed && fixture.validate(parsed)) valid += 1;
      }
      rows.push({
        id: `${method}-${fixture.id}`,
        metrics: {
          method,
          complexity: fixture.id,
          samples: sampleCount,
          validRate: Number((valid / sampleCount).toFixed(3)),
        },
        responseExcerpt: excerpt,
      });
    }
  }

  return {
    caseName: 'structured',
    title: '结构化输出',
    columns: ['method', 'complexity', 'samples', 'validRate'],
    rows,
    conclusions: [
      '分别比较 Ollama JSON Schema、纯提示词和 few-shot，不把可解析 JSON 等同于字段完整。',
    ],
  };
};
