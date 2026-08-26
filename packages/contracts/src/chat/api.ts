import { z } from 'zod';
import { UuidSchema } from '../common/primitives.js';
import { ChatMessageSchema } from './message.js';

export const ChatRequestSchema = z.object({
  sessionId: UuidSchema,
  content: z.string().min(1).max(8000),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
  message: ChatMessageSchema,
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export const ChatStreamEventSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('part'),
    data: z.object({
      messageId: z.string().min(1),
      partId: z.string().min(1),
      text: z.string(),
    }),
  }),
  z.object({
    event: z.literal('done'),
    data: z.object({ messageId: z.string().min(1) }),
  }),
  z.object({
    event: z.literal('error'),
    data: z.object({ message: z.string().min(1) }),
  }),
]);
export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;

export const CHAT_STREAM_EVENTS = ['part', 'done', 'error'] as const;
