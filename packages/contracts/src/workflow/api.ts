import { z } from 'zod';
import { TimestampSchema, UuidSchema } from '../common/primitives.js';
import { WorkflowGraphSchema } from './graph.js';

const UnknownRecordSchema = z.record(z.string(), z.unknown());

export const WorkflowStatusSchema = z.enum(['running', 'completed', 'failed', 'stopped']);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const WorkflowRunSchema = z.object({
  id: UuidSchema,
  workflowId: UuidSchema,
  status: WorkflowStatusSchema,
  inputs: UnknownRecordSchema,
  outputs: UnknownRecordSchema.nullable(),
  graphSnapshot: WorkflowGraphSchema,
  error: z.string().nullable(),
  startedAt: TimestampSchema,
  finishedAt: TimestampSchema.nullable(),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

export const WorkflowNodeRunSchema = z.object({
  id: UuidSchema,
  runId: UuidSchema,
  nodeId: z.string().min(1),
  status: WorkflowStatusSchema,
  inputs: UnknownRecordSchema,
  outputs: UnknownRecordSchema.nullable(),
  elapsedMs: z.number().int().nonnegative(),
  error: z.string().nullable(),
  createdAt: TimestampSchema,
});
export type WorkflowNodeRun = z.infer<typeof WorkflowNodeRunSchema>;

export const WorkflowRunListResponseSchema = z.object({ runs: z.array(WorkflowRunSchema) });
export type WorkflowRunListResponse = z.infer<typeof WorkflowRunListResponseSchema>;

export const WorkflowRunDetailResponseSchema = z.object({
  run: WorkflowRunSchema,
  nodeRuns: z.array(WorkflowNodeRunSchema),
});
export type WorkflowRunDetailResponse = z.infer<typeof WorkflowRunDetailResponseSchema>;

export const WorkflowSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(100),
  graph: WorkflowGraphSchema,
  version: z.number().int().positive(),
  createdAt: TimestampSchema,
});
export type Workflow = z.infer<typeof WorkflowSchema>;

export const CreateWorkflowRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  graph: WorkflowGraphSchema,
});
export type CreateWorkflowRequest = z.infer<typeof CreateWorkflowRequestSchema>;

export const UpdateWorkflowRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    graph: WorkflowGraphSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: '至少提供一个更新字段' });
export type UpdateWorkflowRequest = z.infer<typeof UpdateWorkflowRequestSchema>;

export const WorkflowListResponseSchema = z.object({ workflows: z.array(WorkflowSchema) });

export const ValidateWorkflowRequestSchema = WorkflowGraphSchema;
export type ValidateWorkflowRequest = z.infer<typeof ValidateWorkflowRequestSchema>;

export const WorkflowValidationIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  nodeIds: z.array(z.string()).default([]),
});
export type WorkflowValidationIssue = z.infer<typeof WorkflowValidationIssueSchema>;

export const WorkflowValidationResponseSchema = z.object({
  valid: z.boolean(),
  errors: z.array(WorkflowValidationIssueSchema),
  warnings: z.array(WorkflowValidationIssueSchema),
});
export type WorkflowValidationResponse = z.infer<typeof WorkflowValidationResponseSchema>;

export const RunWorkflowRequestSchema = z.object({
  inputs: UnknownRecordSchema.default({}),
});
export type RunWorkflowRequest = z.infer<typeof RunWorkflowRequestSchema>;

export const StopWorkflowResponseSchema = z.object({ accepted: z.boolean() });
export type StopWorkflowResponse = z.infer<typeof StopWorkflowResponseSchema>;

export const RunNodeRequestSchema = z.object({
  upstreamValues: z.record(z.string(), UnknownRecordSchema).default({}),
  configOverride: UnknownRecordSchema.optional(),
});
export type RunNodeRequest = z.infer<typeof RunNodeRequestSchema>;

export const NodeRunResultSchema = z.object({
  outputs: UnknownRecordSchema,
  nextBranch: z.string().optional(),
  usage: z
    .object({
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
    })
    .optional(),
});
export type NodeRunResult = z.infer<typeof NodeRunResultSchema>;

export const WorkflowRunEventSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('workflow_started'),
    data: z.object({ runId: UuidSchema, graphSnapshot: WorkflowGraphSchema }),
  }),
  z.object({
    event: z.literal('node_started'),
    data: z.object({ nodeId: z.string().min(1), inputs: UnknownRecordSchema }),
  }),
  z.object({
    event: z.literal('node_stream_chunk'),
    data: z.object({ nodeId: z.string().min(1), text: z.string() }),
  }),
  z.object({
    event: z.literal('node_finished'),
    data: z.object({
      nodeId: z.string().min(1),
      outputs: UnknownRecordSchema,
      elapsedMs: z.number().int().nonnegative(),
      status: z.enum(['completed', 'stopped']),
    }),
  }),
  z.object({
    event: z.literal('node_failed'),
    data: z.object({ nodeId: z.string().min(1), error: z.string().min(1) }),
  }),
  z.object({
    event: z.literal('workflow_finished'),
    data: z.object({
      runId: UuidSchema,
      outputs: UnknownRecordSchema,
      totalElapsedMs: z.number().int().nonnegative(),
      status: z.enum(['completed', 'stopped']),
    }),
  }),
  z.object({
    event: z.literal('workflow_failed'),
    data: z.object({
      runId: UuidSchema,
      error: z.string().min(1),
      failedNodeId: z.string().min(1).optional(),
    }),
  }),
]);
export type WorkflowRunEvent = z.infer<typeof WorkflowRunEventSchema>;
