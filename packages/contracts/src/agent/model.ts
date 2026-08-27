import { z } from 'zod';

export const AgentBuiltinToolNameSchema = z.enum(['read', 'write', 'edit', 'glob', 'grep']);
export type AgentBuiltinToolName = z.infer<typeof AgentBuiltinToolNameSchema>;

export const AgentToolNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/);
export type AgentToolName = z.infer<typeof AgentToolNameSchema>;

export const AgentToolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
});
export type AgentToolCall = z.infer<typeof AgentToolCallSchema>;

export const AgentModelMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  toolCallId: z.string().min(1).optional(),
  toolName: AgentToolNameSchema.optional(),
  toolCalls: z.array(AgentToolCallSchema).optional(),
});
export type AgentModelMessage = z.infer<typeof AgentModelMessageSchema>;

export const AgentModelToolSchema = z.object({
  name: AgentToolNameSchema,
  description: z.string().min(1),
  inputSchema: z.record(z.string(), z.unknown()),
});
export type AgentModelTool = z.infer<typeof AgentModelToolSchema>;

export const AgentModelRequestSchema = z.object({
  messages: z.array(AgentModelMessageSchema).min(1),
  tools: z.array(AgentModelToolSchema).max(6),
  toolChoice: z.enum(['auto', 'none']).default('auto'),
});
export type AgentModelRequest = z.infer<typeof AgentModelRequestSchema>;

export const AgentModelResponseSchema = z.object({
  content: z.string(),
  toolCalls: z.array(AgentToolCallSchema),
  finishReason: z.string().optional(),
});
export type AgentModelResponse = z.infer<typeof AgentModelResponseSchema>;
