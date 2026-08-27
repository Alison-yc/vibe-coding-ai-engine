import {
  ChatMessageListResponseSchema,
  ChatSessionListResponseSchema,
  ChatSessionSchema,
  ChatStreamRequestSchema,
  CreateChatSessionRequestSchema,
  type ChatMessage,
  type ChatSession,
  type ChatStreamRequest,
  type CreateChatSessionRequest,
  type UpdateChatSessionRequest,
} from '@ai-engine/contracts';
import type { Platform } from '@ai-engine/platform';
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

export const listChatSessions = async (platform: Platform): Promise<ChatSession[]> => {
  const body = ChatSessionListResponseSchema.parse(await jsonRequest(platform, '/chat/sessions'));
  return body.sessions;
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
      body: JSON.stringify(request),
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
    throw new Error(`无法开始生成：HTTP ${response.status}`);
  }
  await readChatSse(response, (event) => useChatStreamStore.getState().applyEvent(event));
};
