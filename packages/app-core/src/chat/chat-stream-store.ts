import { create } from 'zustand';
import type { ChatMessage, ChatStreamEvent } from '@ai-engine/contracts';
import { applyChatEvent, emptyChatStreamState, type ChatStreamState } from './chat-event-reducer';

type ChatStreamStore = ChatStreamState & {
  hydrate: (sessionId: string, messages: ChatMessage[]) => void;
  applyEvent: (event: ChatStreamEvent) => void;
  appendUser: (message: ChatMessage) => void;
  clearError: () => void;
  markIdle: () => void;
};

/** 仅在切换会话或本地为空时从服务端灌入，避免流式结束后用旧缓存覆盖 SSE 状态导致闪烁 */
export const shouldHydrateMessages = (
  sessionId: string,
  local: Pick<ChatStreamState, 'sessionId' | 'messages'>,
): boolean => local.sessionId !== sessionId || local.messages.length === 0;

export const useChatStreamStore = create<ChatStreamStore>((set) => ({
  ...emptyChatStreamState(),
  hydrate: (sessionId, messages) =>
    set((state) => ({
      sessionId,
      messages,
      streaming: false,
      error: state.error,
    })),
  applyEvent: (event) => set((state) => applyChatEvent(state, event)),
  appendUser: (message) => set((state) => ({ messages: [...state.messages, message] })),
  clearError: () => set({ error: null }),
  markIdle: () => set({ streaming: false }),
}));
