import { z } from 'zod';
import { MessagePartSchema } from '../chat/message.js';
import { UuidSchema } from '../common/primitives.js';
import { AgentModeSchema, AgentApprovalSchema } from './permission.js';

export const AgentStreamRequestSchema = z.object({
  content: z.string().trim().min(1).max(32_000),
  workspaceRoot: z.string().min(1).max(4096),
  mode: AgentModeSchema.default('edit'),
});
export type AgentStreamRequest = z.infer<typeof AgentStreamRequestSchema>;

export const AgentStreamEventSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('message.start'),
    data: z.object({ messageId: UuidSchema }),
  }),
  z.object({
    event: z.literal('message.delta'),
    data: z.object({ messageId: UuidSchema, text: z.string() }),
  }),
  z.object({
    event: z.literal('tool.update'),
    data: z.object({ messageId: UuidSchema, part: MessagePartSchema }),
  }),
  z.object({
    event: z.literal('permission.asked'),
    data: AgentApprovalSchema,
  }),
  z.object({
    event: z.literal('warning'),
    data: z.object({ message: z.string().min(1) }),
  }),
  z.object({
    event: z.literal('done'),
    data: z.object({ messageId: UuidSchema, status: z.enum(['complete', 'interrupted']) }),
  }),
  z.object({
    event: z.literal('error'),
    data: z.object({ message: z.string().min(1) }),
  }),
]);
export type AgentStreamEvent = z.infer<typeof AgentStreamEventSchema>;

export const AgentInputStatusSchema = z.enum(['queued', 'processing', 'completed', 'error']);
export const AgentInputDeliverySchema = z.enum(['pending', 'promoted']);

export const AgentInputSchema = z.object({
  id: UuidSchema,
  sessionId: UuidSchema,
  content: z.string().min(1),
  workspaceRoot: z.string().min(1),
  mode: AgentModeSchema,
  delivery: AgentInputDeliverySchema,
  status: AgentInputStatusSchema,
  createdAt: z.string().datetime(),
});
export type AgentInput = z.infer<typeof AgentInputSchema>;
