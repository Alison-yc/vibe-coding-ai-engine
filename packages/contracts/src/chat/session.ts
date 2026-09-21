import { z } from 'zod';
import { TimestampSchema, UuidSchema } from '../common/primitives.js';
import { ModelIdSchema } from '../llm/model.js';

export const ChatSessionSchema = z.object({
  id: UuidSchema,
  title: z.string().min(1).max(200),
  modelId: ModelIdSchema,
  datasetIds: z.array(UuidSchema),
  agentType: z.enum(['chat', 'agent']).default('chat'),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type ChatSession = z.infer<typeof ChatSessionSchema>;

export const CreateChatSessionRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  datasetIds: z.array(UuidSchema).max(8).optional(),
  agentType: z.enum(['chat', 'agent']).optional(),
  modelId: ModelIdSchema.optional(),
});
export type CreateChatSessionRequest = z.infer<typeof CreateChatSessionRequestSchema>;

export const UpdateChatSessionRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  datasetIds: z.array(UuidSchema).max(8).optional(),
  modelId: ModelIdSchema.optional(),
});
export type UpdateChatSessionRequest = z.infer<typeof UpdateChatSessionRequestSchema>;

export const ChatSessionListResponseSchema = z.object({
  sessions: z.array(ChatSessionSchema),
});
export type ChatSessionListResponse = z.infer<typeof ChatSessionListResponseSchema>;
