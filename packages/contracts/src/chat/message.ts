import { z } from 'zod';
import { TimestampSchema, UuidSchema } from '../common/primitives.js';

export const CitationChunkSchema = z.object({
  documentId: UuidSchema,
  chunkId: UuidSchema,
  documentName: z.string().min(1),
  text: z.string().min(1),
  score: z.number().optional(),
});
export type CitationChunk = z.infer<typeof CitationChunkSchema>;

export const MessagePartSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    id: z.string().min(1),
    text: z.string(),
  }),
  z.object({
    type: z.literal('reasoning'),
    id: z.string().min(1),
    text: z.string(),
  }),
  z.object({
    type: z.literal('tool'),
    id: z.string().min(1),
    name: z.string().min(1),
    state: z.enum(['pending', 'running', 'completed', 'error']),
    input: z.unknown().optional(),
    output: z.string().optional(),
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal('citation'),
    id: z.string().min(1),
    chunks: z.array(CitationChunkSchema),
  }),
]);
export type MessagePart = z.infer<typeof MessagePartSchema>;

export const ChatMessageStatusSchema = z.enum(['complete', 'interrupted']);
export type ChatMessageStatus = z.infer<typeof ChatMessageStatusSchema>;

export const ChatMessageSchema = z.object({
  id: UuidSchema,
  sessionId: UuidSchema,
  role: z.enum(['user', 'assistant', 'system']),
  parts: z.array(MessagePartSchema).min(1),
  seq: z.number().int().nonnegative().default(0),
  status: ChatMessageStatusSchema.default('complete'),
  createdAt: TimestampSchema.optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatMessageListResponseSchema = z.object({
  messages: z.array(ChatMessageSchema),
});
export type ChatMessageListResponse = z.infer<typeof ChatMessageListResponseSchema>;
