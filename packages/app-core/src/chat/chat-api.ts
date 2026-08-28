import {
  ChatModelCatalogResponseSchema,
  ChatMessageListResponseSchema,
  ChatSessionListResponseSchema,
  ChatSessionSchema,
  ChatStreamRequestSchema,
  CreateChatSessionRequestSchema,
  PermissionResponseRequestSchema,
  UpdateChatSessionRequestSchema,
  type ChatMessage,
  type ChatModelCatalogItem,
  type ChatSession,
  type ChatStreamRequest,
  type CreateChatSessionRequest,
  type PermissionDecision,
  type UpdateChatSessionRequest,
} from '@ai-engine/contracts';
import type { Platform } from '@ai-engine/platform';
import { createApiRequestError } from '../api/api-error';
import { readChatSse } from './read-chat-sse';
import { useChatStreamStore } from './chat-stream-store';

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
    throw createApiRequestError(body, response.status);
  }
  return body;
};

export const listChatSessions = async (platform: Platform): Promise<ChatSession[]> => {
  const body = ChatSessionListResponseSchema.parse(await jsonRequest(platform, '/chat/sessions'));
  return body.sessions;
};

export const listChatModels = async (platform: Platform): Promise<ChatModelCatalogItem[]> => {
  const body = ChatModelCatalogResponseSchema.parse(await jsonRequest(platform, '/models'));
  return body.models;
};

export const createChatSession = async (
  platform: Platform,
  request: CreateChatSessionRequest = {},
): Promise<ChatSession> =>
  ChatSessionSchema.parse(
    await jsonRequest(platform, '/chat/sessions', {
      method: 'POST',
      body: JSON.stringify(CreateChatSessionRequestSchema.parse(request)),
    }),
  );

export const updateChatSession = async (
  platform: Platform,
  sessionId: string,
  request: UpdateChatSessionRequest,
): Promise<ChatSession> =>
  ChatSessionSchema.parse(
    await jsonRequest(platform, `/chat/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify(UpdateChatSessionRequestSchema.parse(request)),
    }),
  );

export const deleteChatSession = async (platform: Platform, sessionId: string): Promise<void> => {
  await jsonRequest(platform, `/chat/sessions/${sessionId}`, { method: 'DELETE' });
};

export const listChatMessages = async (
  platform: Platform,
  sessionId: string,
): Promise<ChatMessage[]> => {
  const body = ChatMessageListResponseSchema.parse(
    await jsonRequest(platform, `/chat/sessions/${sessionId}/messages`),
  );
  return body.messages;
};

export const streamChat = async (
  platform: Platform,
  sessionId: string,
  request: ChatStreamRequest,
  signal: AbortSignal,
  requestId: string,
): Promise<void> => {
  const payload = ChatStreamRequestSchema.parse(request);
  const baseUrl = platform.getApiBaseUrl().replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/chat/sessions/${sessionId}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => ({}));
    throw createApiRequestError(body, response.status);
  }
  await readChatSse(response, (event) =>
    useChatStreamStore.getState().applyEvent(event, requestId),
  );
};

export const respondChatPermission = async (
  platform: Platform,
  sessionId: string,
  approvalId: string,
  decision: PermissionDecision,
): Promise<void> => {
  await jsonRequest(platform, `/agent/${sessionId}/permissions/${approvalId}`, {
    method: 'POST',
    body: JSON.stringify(PermissionResponseRequestSchema.parse({ decision })),
  });
};
