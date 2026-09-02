import { z } from 'zod';
import { UuidSchema } from '../common/primitives.js';
import { ValueSelectorSchema } from './value-selector.js';

const JsonValueSchema: z.ZodType<unknown> = z.json();

export const StartInputFieldSchema = z.object({
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  required: z.boolean().default(true),
  defaultValue: JsonValueSchema.optional(),
});
export const StartNodeConfigSchema = z.object({
  fields: z.array(StartInputFieldSchema).max(50),
});

export const EndNodeConfigSchema = z.object({
  outputs: z
    .array(
      z.object({
        name: z.string().min(1),
        selector: ValueSelectorSchema,
        fallbackSelectors: z.array(ValueSelectorSchema).max(10).optional(),
      }),
    )
    .min(1),
});

export const AssignmentValueSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('constant'), value: JsonValueSchema }),
  z.object({ source: z.literal('selector'), selector: ValueSelectorSchema }),
  z.object({ source: z.literal('template'), template: z.string() }),
]);
export const VariableAssignerNodeConfigSchema = z.object({
  assignments: z
    .array(
      z.object({
        name: z.string().min(1),
        value: AssignmentValueSchema,
      }),
    )
    .min(1),
});

export const ConditionOperandSchema = z.union([
  z.object({ source: z.literal('constant'), value: JsonValueSchema }),
  z.object({ source: z.literal('selector'), selector: ValueSelectorSchema }),
]);
export const ConditionSchema = z.object({
  left: ValueSelectorSchema,
  operator: z.enum([
    'equals',
    'not-equals',
    'contains',
    'not-contains',
    'greater-than',
    'less-than',
    'is-empty',
    'is-not-empty',
  ]),
  right: ConditionOperandSchema.optional(),
});
export const IfElseNodeConfigSchema = z.object({
  cases: z
    .array(
      z.object({
        branch: z.string().min(1),
        logicalOperator: z.enum(['and', 'or']).default('and'),
        conditions: z.array(ConditionSchema).min(1),
      }),
    )
    .min(1),
  defaultBranch: z.string().min(1),
});

export const LlmNodeConfigSchema = z.object({
  prompt: z.string().min(1).max(32_000),
  systemPrompt: z.string().max(16_000).optional(),
  numPredict: z.number().int().positive().optional(),
});

export const KnowledgeRetrievalNodeConfigSchema = z.object({
  datasetId: UuidSchema,
  query: z.string().min(1).max(8_000),
  topK: z.number().int().min(1).max(20).default(5),
  scoreThreshold: z.number().min(0).max(1).default(0.3),
});

export const HttpRequestNodeConfigSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  url: z.string().min(1).max(4_096),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.string().max(1_000_000).optional(),
});

export const CodeNodeConfigSchema = z.object({
  code: z.string().min(1).max(100_000),
  inputs: z.record(z.string(), ValueSelectorSchema).default({}),
});

export type StartNodeConfig = z.infer<typeof StartNodeConfigSchema>;
export type EndNodeConfig = z.infer<typeof EndNodeConfigSchema>;
export type VariableAssignerNodeConfig = z.infer<typeof VariableAssignerNodeConfigSchema>;
export type IfElseNodeConfig = z.infer<typeof IfElseNodeConfigSchema>;
export type LlmNodeConfig = z.infer<typeof LlmNodeConfigSchema>;
export type KnowledgeRetrievalNodeConfig = z.infer<typeof KnowledgeRetrievalNodeConfigSchema>;
export type HttpRequestNodeConfig = z.infer<typeof HttpRequestNodeConfigSchema>;
export type CodeNodeConfig = z.infer<typeof CodeNodeConfigSchema>;
