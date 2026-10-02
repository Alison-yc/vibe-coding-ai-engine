import { z } from 'zod';

export const NodeTypeSchema = z.enum([
  'start',
  'end',
  'variable-assigner',
  'if-else',
  'llm',
  'knowledge-retrieval',
  'http-request',
  'code',
]);
export type NodeType = z.infer<typeof NodeTypeSchema>;

export const NODE_TYPES = NodeTypeSchema.options;
