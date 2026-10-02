import { z } from 'zod';

export const LlmStreamEventSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('chunk'),
    data: z.object({ text: z.string() }),
  }),
  z.object({
    event: z.literal('done'),
    data: z.object({ finishReason: z.string().optional() }),
  }),
  z.object({
    event: z.literal('error'),
    data: z.object({ message: z.string().min(1) }),
  }),
]);
export type LlmStreamEvent = z.infer<typeof LlmStreamEventSchema>;

export const LLM_STREAM_EVENTS = ['chunk', 'done', 'error'] as const;
