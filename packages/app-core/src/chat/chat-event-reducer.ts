import type { ChatMessage, ChatStreamEvent } from '@ai-engine/contracts';

export type ChatStreamState = {
  sessionId: string | null;
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
};

export const emptyChatStreamState = (): ChatStreamState => ({
  sessionId: null,
  messages: [],
  streaming: false,
  error: null,
});

const replaceMessage = (
  messages: ChatMessage[],
  messageId: string,
  update: (message: ChatMessage) => ChatMessage,
): ChatMessage[] =>
  messages.map((message) => (message.id === messageId ? update(message) : message));

export const applyChatEvent = (state: ChatStreamState, event: ChatStreamEvent): ChatStreamState => {
  switch (event.event) {
    case 'message.start':
      return {
        ...state,
        streaming: true,
        error: null,
        messages: [
          ...state.messages,
          {
            id: event.data.messageId,
            sessionId: state.sessionId ?? event.data.messageId,
            role: event.data.role,
            parts: [],
            seq: state.messages.length,
            status: 'complete',
          },
        ],
      };
    case 'message.part.start':
      return {
        ...state,
        messages: replaceMessage(state.messages, event.data.messageId, (message) => ({
          ...message,
          parts: [...message.parts, { type: event.data.type, id: event.data.partId, text: '' }],
        })),
      };
    case 'message.part.delta':
      return {
        ...state,
        messages: replaceMessage(state.messages, event.data.messageId, (message) => ({
          ...message,
          parts: message.parts.map((part) =>
            part.id === event.data.partId && part.type === 'text'
              ? { ...part, text: part.text + event.data.text }
              : part,
          ),
        })),
      };
    case 'message.part.end':
      return state;
    case 'message.citations':
      return {
        ...state,
        messages: replaceMessage(state.messages, event.data.messageId, (message) => ({
          ...message,
          parts: [
            ...message.parts,
            {
              type: 'citation',
              id: `${event.data.messageId}-citations`,
              chunks: event.data.chunks,
            },
          ],
        })),
      };
    case 'done':
      return {
        ...state,
        streaming: false,
        messages: replaceMessage(state.messages, event.data.messageId, (message) => ({
          ...message,
          status: event.data.status,
        })),
      };
    case 'error':
      return { ...state, streaming: false, error: event.data.message };
    default:
      return state;
  }
};
