import { z } from 'zod';
import { TimestampSchema, UuidSchema } from '../common/primitives.js';

export const ChatSessionSchema = z.object({
  id: UuidSchema,
  title: z.string().min(1).max(200),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type ChatSession = z.infer<typeof ChatSessionSchema>;
