import type { Platform } from '@ai-engine/platform';
import type { ChatStreamRequest } from '@ai-engine/contracts';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { apiErrorCodeFrom } from '../i18n/localize-api-error';
import { streamChat } from './chat-api';
import { useChatStreamStore } from './chat-stream-store';

export const isAbortError = (error: unknown, aborted: boolean): boolean =>
  aborted || (error instanceof Error && error.name === 'AbortError');

export const publicChatError = (error: unknown): string => {
  const code = apiErrorCodeFrom(error);
  if (code) return `api-error:${code}`;
  return error instanceof Error ? error.message : 'chat-error:fallback';
};

export const runChatStream = async (input: {
  platform: Platform;
  sessionId: string;
  request: ChatStreamRequest;
  signal: AbortSignal;
  queryClient: QueryClient;
}): Promise<void> => {
  const text = input.request.content.trim();
  if (!text) return;
  const requestId = useChatStreamStore.getState().beginRequest(input.sessionId);
  useChatStreamStore.getState().appendUser({
    id: crypto.randomUUID(),
    sessionId: input.sessionId,
    role: 'user',
    parts: [{ type: 'text', id: crypto.randomUUID(), text }],
    seq: useChatStreamStore.getState().messages.length,
    status: 'complete',
  });
  try {
    await streamChat(
      input.platform,
      input.sessionId,
      { ...input.request, content: text },
      input.signal,
      requestId,
    );
  } catch (error) {
    if (isAbortError(error, input.signal.aborted)) return;
    useChatStreamStore.setState((state) =>
      state.activeRequestId === requestId ? { error: publicChatError(error) } : {},
    );
  } finally {
    useChatStreamStore.getState().markIdle(requestId);
    void input.queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
    void input.queryClient.invalidateQueries({ queryKey: ['chat-messages', input.sessionId] });
  }
};

export const useChatStream = (platform: Platform, sessionId: string | undefined) => {
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);
  const streaming = useChatStreamStore((state) => state.streaming);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    useChatStreamStore.getState().markIdle();
  };

  const send = async (
    content: string,
    options: Omit<ChatStreamRequest, 'content'> = { fileAccess: false, mode: 'edit' },
  ) => {
    if (!sessionId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await runChatStream({
        platform,
        sessionId,
        request: { content, ...options },
        signal: controller.signal,
        queryClient,
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [sessionId],
  );

  return { send, stop, streaming };
};
