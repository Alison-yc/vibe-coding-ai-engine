import { z } from 'zod';
import { UuidSchema } from '../common/primitives.js';
import { AgentToolNameSchema } from './model.js';

export const AgentModeSchema = z.enum(['read-only', 'edit']);
export type AgentMode = z.infer<typeof AgentModeSchema>;

export const PermissionKindSchema = z.enum(['read', 'write', 'execute']);
export type PermissionKind = z.infer<typeof PermissionKindSchema>;

export const PermissionEffectSchema = z.enum(['allow', 'deny', 'ask']);
export type PermissionEffect = z.infer<typeof PermissionEffectSchema>;

export const PermissionRuleSchema = z.object({
  tool: z.union([AgentToolNameSchema, z.literal('*')]),
  resource: z.string().min(1),
  effect: PermissionEffectSchema,
});
export type PermissionRule = z.infer<typeof PermissionRuleSchema>;

export const PermissionDecisionSchema = z.enum(['allow-once', 'allow-session', 'deny']);
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;

export const PermissionResponseRequestSchema = z.object({
  decision: PermissionDecisionSchema,
});
export type PermissionResponseRequest = z.infer<typeof PermissionResponseRequestSchema>;

export const AgentApprovalSchema = z.object({
  id: UuidSchema,
  sessionId: UuidSchema,
  toolCallId: z.string().min(1),
  tool: AgentToolNameSchema,
  resource: z.string().min(1),
  diff: z.string().max(100_000),
});
export type AgentApproval = z.infer<typeof AgentApprovalSchema>;
