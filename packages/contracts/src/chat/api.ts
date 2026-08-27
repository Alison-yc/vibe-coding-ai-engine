import { z } from 'zod';
import { UuidSchema } from '../common/primitives.js';
import { ChatMessageSchema } from './message.js';

export const LlmChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});
export type LlmChatMessage = z.infer<typeof LlmChatMessageSchema>;

export const ChatRequestSchema = z.object({
  sessionId: UuidSchema,
  content: z.string().min(1).max(32_000),
  messages: z.array(LlmChatMessageSchema).optional(),
  numPredict: z.number().int().positive().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
  message: ChatMessageSchema,
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export const ChatStreamRequestSchema = z.object({
  content: z.string().min(1).max(8000),
  datasetIds: z.array(UuidSchema).max(8).optional(),
});
export type ChatStreamRequest = z.infer<typeof ChatStreamRequestSchema>;

export const ChatStreamEventSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('message.start'),
    data: z.object({ messageId: UuidSchema, role: z.literal('assistant') }),
  }),
  z.object({
    event: z.literal('message.part.start'),
    data: z.object({ messageId: UuidSchema, partId: z.string().min(1), type: z.literal('text') }),
  }),
  z.object({
    event: z.literal('message.part.delta'),
    data: z.object({ messageId: UuidSchema, partId: z.string().min(1), text: z.string() }),
  }),
  z.object({
    event: z.literal('message.part.end'),
    data: z.object({ messageId: UuidSchema, partId: z.string().min(1) }),
  }),
  z.object({
    event: z.literal('message.citations'),
    data: z.object({
      messageId: UuidSchema,
      chunks: z.array(
        z.object({
          documentId: UuidSchema,
          chunkId: UuidSchema,
          documentName: z.string().min(1),
          text: z.string().min(1),
          score: z.number().optional(),
        }),
      ),
    }),
  }),
  z.object({
    event: z.literal('done'),
    data: z.object({
      messageId: UuidSchema,
      status: z.enum(['complete', 'interrupted']),
    }),
  }),
  z.object({
    event: z.literal('error'),
    data: z.object({ message: z.string().min(1) }),
  }),
]);
export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;

export const CHAT_STREAM_EVENTS = [
  'message.start',
  'message.part.start',
  'message.part.delta',
  'message.part.end',
  'message.citations',
  'done',
  'error',
] as const;
