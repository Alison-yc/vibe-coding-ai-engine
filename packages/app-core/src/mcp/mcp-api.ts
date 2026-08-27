import {
  AgentExposedToolsResponseSchema,
  McpServerListResponseSchema,
  McpServerNameSchema,
  McpServerPatchRequestSchema,
  McpServerStatusSchema,
  McpServerToolsResponseSchema,
  type AgentExposedToolsResponse,
  type McpRemoteTool,
  type McpServerPatchRequest,
  type McpServerStatus,
} from '@ai-engine/contracts';
import type { Platform } from '@ai-engine/platform';

const jsonRequest = async (
  platform: Platform,
  path: string,
  init?: RequestInit,
): Promise<unknown> => {
  const baseUrl = platform.getApiBaseUrl().replace(/\/$/, '');
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
        ? body.message
        : `请求失败 ${response.status}`;
    throw new Error(message);
  }
  return body;
};

export const listMcpServers = async (platform: Platform): Promise<McpServerStatus[]> =>
  McpServerListResponseSchema.parse(await jsonRequest(platform, '/mcp/servers')).servers;

export const listMcpServerTools = async (
  platform: Platform,
  name: string,
): Promise<McpRemoteTool[]> =>
  McpServerToolsResponseSchema.parse(
    await jsonRequest(platform, `/mcp/servers/${McpServerNameSchema.parse(name)}/tools`),
  ).tools;

export const reconnectMcpServer = async (
  platform: Platform,
  name: string,
): Promise<McpServerStatus> =>
  McpServerStatusSchema.parse(
    await jsonRequest(platform, `/mcp/servers/${McpServerNameSchema.parse(name)}/reconnect`, {
      method: 'POST',
    }),
  );

export const patchMcpServer = async (
  platform: Platform,
  name: string,
  patch: McpServerPatchRequest,
): Promise<McpServerStatus> =>
  McpServerStatusSchema.parse(
    await jsonRequest(platform, `/mcp/servers/${McpServerNameSchema.parse(name)}`, {
      method: 'PATCH',
      body: JSON.stringify(McpServerPatchRequestSchema.parse(patch)),
    }),
  );

export const listExposedAgentTools = async (
  platform: Platform,
  sessionId?: string,
): Promise<AgentExposedToolsResponse> => {
  const query = sessionId ? `?sessionId=${sessionId}` : '';
  return AgentExposedToolsResponseSchema.parse(await jsonRequest(platform, `/agent/tools${query}`));
};
