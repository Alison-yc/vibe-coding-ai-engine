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

export const useChatStreamStore = create<ChatStreamStore>((set) => ({
  ...emptyChatStreamState(),
  hydrate: (sessionId, messages) => set({ sessionId, messages, streaming: false, error: null }),
  applyEvent: (event) => set((state) => applyChatEvent(state, event)),
  appendUser: (message) => set((state) => ({ messages: [...state.messages, message] })),
  clearError: () => set({ error: null }),
  markIdle: () => set({ streaming: false }),
}));
