import { z } from 'zod';
import { NodeTypeSchema } from './node-type.js';

export const WorkflowNodeSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.literal('custom-node').default('custom-node'),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  data: z.object({
    type: NodeTypeSchema,
    title: z.string().min(1).max(100).optional(),
    config: z.record(z.string(), z.unknown()),
  }),
});
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const WorkflowEdgeSchema = z.object({
  id: z.string().min(1).max(100),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().min(1).optional(),
});
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const WorkflowGraphSchema = z.object({
  nodes: z.array(WorkflowNodeSchema).min(2).max(200),
  edges: z.array(WorkflowEdgeSchema).max(500),
  viewport: z
    .object({
      x: z.number(),
      y: z.number(),
      zoom: z.number().positive(),
    })
    .default({ x: 0, y: 0, zoom: 1 }),
});
export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;
