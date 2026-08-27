import { describe, expect, it } from 'vitest';
import { VariablePool } from '../engine/variable-pool';
import { EndNodeRunner } from './end.runner';
import { IfElseNodeRunner } from './if-else.runner';
import { StartNodeRunner } from './start.runner';
import { VariableAssignerNodeRunner } from './variable-assigner.runner';

describe('StartNodeRunner', () => {
  it('校验并输出工作流输入', async () => {
    const result = await new StartNodeRunner().run(
      {
        fields: [
          { name: 'query', type: 'string', required: true },
          { name: 'count', type: 'number', required: false, defaultValue: 1 },
        ],
      },
      new VariablePool({ query: '你好' }),
    );
    expect(result.outputs).toEqual({ query: '你好', count: 1 });
  });

  it('拒绝缺失或类型错误的输入', async () => {
    const runner = new StartNodeRunner();
    await expect(
      runner.run(
        { fields: [{ name: 'query', type: 'string', required: true }] },
        new VariablePool({}),
      ),
    ).rejects.toThrow('缺少必填输入');
    await expect(
      runner.run(
        { fields: [{ name: 'query', type: 'string', required: true }] },
        new VariablePool({ query: 1 }),
      ),
    ).rejects.toThrow('类型应为 string');
  });

  it('支持数组、对象、布尔类型并忽略未提供的可选值', async () => {
    await expect(
      new StartNodeRunner().run(
        {
          fields: [
            { name: 'tags', type: 'array', required: true },
            { name: 'metadata', type: 'object', required: true },
            { name: 'enabled', type: 'boolean', required: true },
            { name: 'optional', type: 'string', required: false },
          ],
        },
        new VariablePool({ tags: [], metadata: {}, enabled: false }),
      ),
    ).resolves.toEqual({
      outputs: { tags: [], metadata: {}, enabled: false },
    });
  });
});

describe('EndNodeRunner', () => {
  it('按选择器组装最终输出', async () => {
    const pool = new VariablePool({});
    pool.set('source', { text: '答案' });
    await expect(
      new EndNodeRunner().run(
        { outputs: [{ name: 'answer', selector: ['source', 'text'] }] },
        pool,
      ),
    ).resolves.toEqual({ outputs: { answer: '答案' } });
  });

  it('拒绝不存在的输出变量', async () => {
    await expect(
      new EndNodeRunner().run(
        { outputs: [{ name: 'answer', selector: ['source', 'text'] }] },
        new VariablePool({}),
      ),
    ).rejects.toThrow('变量不存在');
  });
});

describe('VariableAssignerNodeRunner', () => {
  it('支持常量、选择器与模板赋值', async () => {
    const pool = new VariablePool({ query: '问题' });
    pool.set('source', { count: 2 });
    const result = await new VariableAssignerNodeRunner().run(
      {
        assignments: [
          { name: 'fixed', value: { source: 'constant', value: true } },
          { name: 'count', value: { source: 'selector', selector: ['source', 'count'] } },
          { name: 'title', value: { source: 'template', template: '问：{{#sys.query#}}' } },
        ],
      },
      pool,
    );
    expect(result.outputs).toEqual({ fixed: true, count: 2, title: '问：问题' });
  });

  it('拒绝不存在的选择器来源', async () => {
    await expect(
      new VariableAssignerNodeRunner().run(
        {
          assignments: [
            { name: 'value', value: { source: 'selector', selector: ['missing', 'value'] } },
          ],
        },
        new VariablePool({}),
      ),
    ).rejects.toThrow('来源不存在');
  });
});

describe('IfElseNodeRunner', () => {
  it('计算条件组并返回匹配分支', async () => {
    const pool = new VariablePool({});
    pool.set('source', { score: 8, tags: ['rag'], text: 'hello' });
    const result = await new IfElseNodeRunner().run(
      {
        cases: [
          {
            branch: 'yes',
            logicalOperator: 'and',
            conditions: [
              {
                left: ['source', 'score'],
                operator: 'greater-than',
                right: { source: 'constant', value: 5 },
              },
              {
                left: ['source', 'tags'],
                operator: 'contains',
                right: { source: 'constant', value: 'rag' },
              },
            ],
          },
        ],
        defaultBranch: 'no',
      },
      pool,
    );
    expect(result).toEqual({ outputs: { branch: 'yes' }, nextBranch: 'yes' });
  });

  it('条件不匹配时走默认分支', async () => {
    const runner = new IfElseNodeRunner();
    expect(runner.configSchema.safeParse({ cases: [], defaultBranch: 'no' }).success).toBe(false);
    const pool = new VariablePool({});
    pool.set('source', { empty: '' });
    const result = await runner.run(
      {
        cases: [
          {
            branch: 'yes',
            logicalOperator: 'or',
            conditions: [
              {
                left: ['source', 'empty'],
                operator: 'is-not-empty',
              },
            ],
          },
        ],
        defaultBranch: 'no',
      },
      pool,
    );
    expect(result.nextBranch).toBe('no');
  });

  it('覆盖全部比较运算符和选择器右值', async () => {
    const pool = new VariablePool({});
    pool.set('source', {
      one: 1,
      two: 2,
      text: 'abc',
      tags: ['a'],
      empty: '',
      value: 'x',
    });
    const conditions = [
      {
        left: ['source', 'one'],
        operator: 'equals' as const,
        right: { source: 'selector' as const, selector: ['source', 'one'] },
      },
      {
        left: ['source', 'one'],
        operator: 'not-equals' as const,
        right: { source: 'constant' as const, value: 2 },
      },
      {
        left: ['source', 'text'],
        operator: 'contains' as const,
        right: { source: 'constant' as const, value: 'b' },
      },
      {
        left: ['source', 'tags'],
        operator: 'not-contains' as const,
        right: { source: 'constant' as const, value: 'b' },
      },
      {
        left: ['source', 'two'],
        operator: 'greater-than' as const,
        right: { source: 'constant' as const, value: 1 },
      },
      {
        left: ['source', 'one'],
        operator: 'less-than' as const,
        right: { source: 'constant' as const, value: 2 },
      },
      { left: ['source', 'empty'], operator: 'is-empty' as const },
      { left: ['source', 'value'], operator: 'is-not-empty' as const },
    ];
    const runner = new IfElseNodeRunner();
    const config = runner.configSchema.parse({
      cases: [{ branch: 'all', logicalOperator: 'and', conditions }],
      defaultBranch: 'no',
    });
    expect(await runner.run(config, pool)).toMatchObject({ nextBranch: 'all' });
    expect(runner.getValueSelectors(config)).toContainEqual(['source', 'one']);
  });
});
