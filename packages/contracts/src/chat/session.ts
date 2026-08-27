import { z } from 'zod';
import { TimestampSchema, UuidSchema } from '../common/primitives.js';

export const ChatSessionSchema = z.object({
  id: UuidSchema,
  title: z.string().min(1).max(200),
  modelId: z.string().min(1),
  datasetIds: z.array(UuidSchema),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type ChatSession = z.infer<typeof ChatSessionSchema>;

export const CreateChatSessionRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  datasetIds: z.array(UuidSchema).max(8).optional(),
});
export type CreateChatSessionRequest = z.infer<typeof CreateChatSessionRequestSchema>;

export const UpdateChatSessionRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  datasetIds: z.array(UuidSchema).max(8).optional(),
});
export type UpdateChatSessionRequest = z.infer<typeof UpdateChatSessionRequestSchema>;

export const ChatSessionListResponseSchema = z.object({
  sessions: z.array(ChatSessionSchema),
});
export type ChatSessionListResponse = z.infer<typeof ChatSessionListResponseSchema>;
