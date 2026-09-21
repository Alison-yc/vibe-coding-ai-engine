import { z } from 'zod';
import { PermissionKindSchema } from '../agent/permission.js';

export const McpServerNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/);
export type McpServerName = z.infer<typeof McpServerNameSchema>;

export const McpToolFilterSchema = z.object({
  include: z.array(z.string().min(1).max(128)).max(32).optional(),
  inputParams: z
    .record(z.string().min(1).max(128), z.array(z.string().min(1).max(64)).min(1).max(8))
    .optional(),
  requiredParams: z
    .record(z.string().min(1).max(128), z.array(z.string().min(1).max(64)).min(1).max(8))
    .optional(),
  fixedParams: z
    .record(
      z.string().min(1).max(128),
      z.record(z.string().min(1).max(64), z.union([z.string().max(128), z.number(), z.boolean()])),
    )
    .optional(),
});
export type McpToolFilter = z.infer<typeof McpToolFilterSchema>;

export const McpToolPermissionSchema = z.object({
  kind: PermissionKindSchema,
  resourceParam: z.string().min(1).max(64).optional(),
});
export type McpToolPermission = z.infer<typeof McpToolPermissionSchema>;

const McpStdioServerSchema = z.object({
  type: z.literal('stdio'),
  command: z.string().min(1).max(256),
  args: z.array(z.string().max(4096)).max(32).default([]),
  enabled: z.boolean().default(true),
  timeout: z.number().int().min(1000).max(120_000).default(30_000),
  flattenNames: z.boolean().default(false),
  toolFilter: McpToolFilterSchema.optional(),
  toolPermissions: z.record(z.string(), McpToolPermissionSchema).default({}),
});

const McpHttpServerSchema = z.object({
  type: z.literal('http'),
  url: z.string().url().max(2048),
  enabled: z.boolean().default(true),
  timeout: z.number().int().min(1000).max(120_000).default(30_000),
  flattenNames: z.boolean().default(false),
  toolFilter: McpToolFilterSchema.optional(),
  toolPermissions: z.record(z.string(), McpToolPermissionSchema).default({}),
});

export const McpServerConfigSchema = z.discriminatedUnion('type', [
  McpStdioServerSchema,
  McpHttpServerSchema,
]);
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export const McpConfigFileSchema = z.object({
  mcpServers: z.record(McpServerNameSchema, McpServerConfigSchema).default({}),
});
export type McpConfigFile = z.infer<typeof McpConfigFileSchema>;

export const McpConnectionStatusSchema = z.enum(['connected', 'disconnected', 'error']);
export type McpConnectionStatus = z.infer<typeof McpConnectionStatusSchema>;

export const McpServerStatusSchema = z.object({
  name: McpServerNameSchema,
  type: z.enum(['stdio', 'http']),
  enabled: z.boolean(),
  status: McpConnectionStatusSchema,
  error: z.string().max(1000).optional(),
  toolCount: z.number().int().nonnegative(),
  selectedToolCount: z.number().int().nonnegative(),
});
export type McpServerStatus = z.infer<typeof McpServerStatusSchema>;

export const McpServerListResponseSchema = z.object({
  servers: z.array(McpServerStatusSchema),
});
export type McpServerListResponse = z.infer<typeof McpServerListResponseSchema>;

export const McpRemoteToolSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  exposedName: z.string().min(1),
  selected: z.boolean(),
  permissionKind: PermissionKindSchema,
});
export type McpRemoteTool = z.infer<typeof McpRemoteToolSchema>;

export const McpServerToolsResponseSchema = z.object({
  tools: z.array(McpRemoteToolSchema),
});
export type McpServerToolsResponse = z.infer<typeof McpServerToolsResponseSchema>;

export const McpServerPatchRequestSchema = z
  .object({
    enabled: z.boolean().optional(),
    flattenNames: z.boolean().optional(),
    toolFilter: McpToolFilterSchema.optional(),
  })
  .strict();
export type McpServerPatchRequest = z.infer<typeof McpServerPatchRequestSchema>;

export const AgentExposedToolsResponseSchema = z.object({
  tools: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().min(1),
      source: z.enum(['builtin', 'mcp']),
    }),
  ),
  dropped: z.array(z.string().min(1)),
  maxToolCount: z.number().int().nonnegative(),
});
export type AgentExposedToolsResponse = z.infer<typeof AgentExposedToolsResponseSchema>;
