import { VariableAssignerNodeConfigSchema } from '@ai-engine/contracts';

export const variableAssignerDefaultConfig = {
  assignments: [{ name: 'value', value: { source: 'constant', value: '' } }],
};

export const variableAssignerOutputVars = (config: Record<string, unknown>) => {
  const parsed = VariableAssignerNodeConfigSchema.safeParse(config);
  return parsed.success
    ? parsed.data.assignments.map((assignment) => ({
        name: assignment.name,
        type: 'unknown' as const,
      }))
    : [];
};

export const validateVariableAssignerConfig = (config: Record<string, unknown>): string[] => {
  const result = VariableAssignerNodeConfigSchema.safeParse(config);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};
