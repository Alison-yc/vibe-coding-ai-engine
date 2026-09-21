import type {
  AgentApproval,
  ChatMessage,
  ChatStreamEvent,
  MessagePart,
} from '@ai-engine/contracts';

export type ChatStreamState = {
  sessionId: string | null;
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  warning: string | null;
  approval: AgentApproval | null;
};

export const emptyChatStreamState = (): ChatStreamState => ({
  sessionId: null,
  messages: [],
  streaming: false,
  error: null,
  warning: null,
  approval: null,
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
    case 'message.delta':
      return {
        ...state,
        messages: replaceMessage(state.messages, event.data.messageId, (message) => {
          const textPart = message.parts.find((part) => part.type === 'text');
          return {
            ...message,
            parts: textPart
              ? message.parts.map((part) =>
                  part.id === textPart.id && part.type === 'text'
                    ? { ...part, text: part.text + event.data.text }
                    : part,
                )
              : [
                  ...message.parts,
                  { type: 'text' as const, id: crypto.randomUUID(), text: event.data.text },
                ],
          };
        }),
      };
    case 'tool.update':
      return {
        ...state,
        messages: replaceMessage(state.messages, event.data.messageId, (message) => {
          const exists = message.parts.some((part) => part.id === event.data.part.id);
          const parts: MessagePart[] = exists
            ? message.parts.map((part) => (part.id === event.data.part.id ? event.data.part : part))
            : [...message.parts, event.data.part];
          return { ...message, parts };
        }),
      };
    case 'permission.asked':
      return { ...state, approval: event.data };
    case 'warning':
      return { ...state, warning: event.data.message };
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
