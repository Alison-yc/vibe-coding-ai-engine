import type { Platform } from '@ai-engine/platform';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { streamChat } from './chat-api';
import { useChatStreamStore } from './chat-stream-store';

export const isAbortError = (error: unknown, aborted: boolean): boolean =>
  aborted || (error instanceof Error && error.name === 'AbortError');

export const publicChatError = (error: unknown): string =>
  error instanceof Error ? error.message : '生成失败';

export const runChatStream = async (input: {
  platform: Platform;
  sessionId: string;
  content: string;
  datasetIds: string[] | undefined;
  signal: AbortSignal;
  queryClient: QueryClient;
}): Promise<void> => {
  const text = input.content.trim();
  if (!text) return;
  useChatStreamStore.getState().clearError();
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
      { content: text, datasetIds: input.datasetIds },
      input.signal,
    );
  } catch (error) {
    if (isAbortError(error, input.signal.aborted)) return;
    useChatStreamStore.setState({ streaming: false, error: publicChatError(error) });
  } finally {
    useChatStreamStore.getState().markIdle();
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

  const send = async (content: string, datasetIds?: string[]) => {
    if (!sessionId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await runChatStream({
        platform,
        sessionId,
        content,
        datasetIds,
        signal: controller.signal,
        queryClient,
      });
    } finally {
      abortRef.current = null;
    }
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  return { send, stop, streaming };
};
