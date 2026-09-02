import {
  IfElseNodeConfigSchema,
  type IfElseNodeConfig,
  type NodeRunResult,
  type ValueSelector,
} from '@ai-engine/contracts';
import type { NodeRunner, VariablePoolReader } from '../engine/types';

type Condition = IfElseNodeConfig['cases'][number]['conditions'][number];

const empty = (value: unknown): boolean =>
  value == null || value === '' || (Array.isArray(value) && value.length === 0);

const contains = (left: unknown, right: unknown): boolean =>
  (typeof left === 'string' && typeof right === 'string' && left.includes(right)) ||
  (Array.isArray(left) && left.some((item) => Object.is(item, right)));

const rightValue = (condition: Condition, pool: VariablePoolReader): unknown => {
  if (!condition.right) return undefined;
  return condition.right.source === 'constant'
    ? condition.right.value
    : pool.get(condition.right.selector);
};

const evaluate = (condition: Condition, pool: VariablePoolReader): boolean => {
  const left = pool.get(condition.left);
  const right = rightValue(condition, pool);
  switch (condition.operator) {
    case 'equals':
      return Object.is(left, right);
    case 'not-equals':
      return !Object.is(left, right);
    case 'contains':
      return contains(left, right);
    case 'not-contains':
      return !contains(left, right);
    case 'greater-than':
      return typeof left === 'number' && typeof right === 'number' && left > right;
    case 'less-than':
      return typeof left === 'number' && typeof right === 'number' && left < right;
    case 'is-empty':
      return empty(left);
    case 'is-not-empty':
      return !empty(left);
  }
};

export class IfElseNodeRunner implements NodeRunner<IfElseNodeConfig> {
  readonly type = 'if-else' as const;
  readonly configSchema = IfElseNodeConfigSchema;

  getValueSelectors(config: IfElseNodeConfig): ValueSelector[] {
    return config.cases.flatMap((item) =>
      item.conditions.flatMap((condition) => [
        condition.left,
        ...(condition.right?.source === 'selector' ? [condition.right.selector] : []),
      ]),
    );
  }

  getBranchHandles(config: IfElseNodeConfig): string[] {
    return [...config.cases.map((item) => item.branch), config.defaultBranch];
  }

  async run(config: IfElseNodeConfig, pool: VariablePoolReader): Promise<NodeRunResult> {
    await Promise.resolve();
    for (const item of config.cases) {
      const results = item.conditions.map((condition) => evaluate(condition, pool));
      const matched =
        item.logicalOperator === 'and' ? results.every(Boolean) : results.some(Boolean);
      if (matched) return { outputs: { branch: item.branch }, nextBranch: item.branch };
    }
    return {
      outputs: { branch: config.defaultBranch },
      nextBranch: config.defaultBranch,
    };
  }
}
