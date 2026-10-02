import { z } from 'zod';
import { UuidSchema } from '../common/primitives.js';
import { ModelIdSchema } from '../llm/model.js';
import { AgentApprovalSchema, AgentModeSchema } from '../agent/permission.js';
import { ChatMessageSchema, MessagePartSchema } from './message.js';

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
  modelId: ModelIdSchema.optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
  message: ChatMessageSchema,
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export const ChatStreamRequestSchema = z
  .object({
    content: z.string().min(1).max(8000),
    datasetIds: z.array(UuidSchema).max(8).optional(),
    fileAccess: z.boolean().default(false),
    workspaceRoot: z.string().min(1).max(4096).optional(),
    mode: AgentModeSchema.default('edit'),
  })
  .superRefine((value, context) => {
    if (value.fileAccess && !value.workspaceRoot) {
      context.addIssue({
        code: 'custom',
        path: ['workspaceRoot'],
        message: '开启文件访问时必须提供工作区目录',
      });
    }
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
  'message.delta',
  'tool.update',
  'permission.asked',
  'warning',
  'message.citations',
  'done',
  'error',
] as const;
