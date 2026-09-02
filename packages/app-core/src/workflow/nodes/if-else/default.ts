import { IfElseNodeConfigSchema } from '@ai-engine/contracts';

export const ifElseDefaultConfig = {
  cases: [
    {
      branch: 'yes',
      logicalOperator: 'and',
      conditions: [
        {
          left: ['start', 'query'],
          operator: 'is-not-empty',
        },
      ],
    },
  ],
  defaultBranch: 'no',
};

export const ifElseOutputVars = () => [{ name: 'branch', type: 'string' as const }];

export const ifElseSourceHandles = (config: Record<string, unknown>): string[] => {
  const result = IfElseNodeConfigSchema.safeParse(config);
  return result.success
    ? [...result.data.cases.map((item) => item.branch), result.data.defaultBranch]
    : [];
};

export const validateIfElseConfig = (config: Record<string, unknown>): string[] => {
  const result = IfElseNodeConfigSchema.safeParse(config);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};
