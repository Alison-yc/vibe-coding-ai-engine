import type {
  AgentApproval,
  AgentStreamEvent,
  ChatMessage,
  MessagePart,
} from '@ai-engine/contracts';
import { AgentApprovalSchema } from '@ai-engine/contracts';
import { create } from 'zustand';

type AgentState = {
  sessionId: string | null;
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  approval: AgentApproval | null;
  resolvedApprovalIds: string[];
  hydrate: (sessionId: string, messages: ChatMessage[]) => void;
  begin: (sessionId: string, content: string) => void;
  applyEvent: (event: AgentStreamEvent) => void;
  clearApproval: (approvalId?: string) => void;
  stop: () => void;
  reset: (sessionId?: string) => void;
};

const hasActiveTool = (messages: ChatMessage[]): boolean =>
  messages.some((message) =>
    message.parts.some(
      (part) => part.type === 'tool' && (part.state === 'pending' || part.state === 'running'),
    ),
  );

export const shouldHydrateAgentMessages = (
  sessionId: string,
  state: Pick<AgentState, 'sessionId' | 'messages'>,
): boolean =>
  state.sessionId !== sessionId || state.messages.length === 0 || hasActiveTool(state.messages);

const updateMessage = (
  messages: ChatMessage[],
  messageId: string,
  update: (message: ChatMessage) => ChatMessage,
): ChatMessage[] =>
  messages.map((message) => (message.id === messageId ? update(message) : message));

const pendingApproval = (
  sessionId: string,
  messages: ChatMessage[],
  resolvedApprovalIds: string[],
): AgentApproval | null => {
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== 'tool' || part.state !== 'pending' || !part.permission) continue;
      const parsed = AgentApprovalSchema.safeParse({
        id: part.permission.id,
        sessionId,
        toolCallId: part.id,
        tool: part.name,
        resource: part.permission.resource,
        diff: part.permission.diff,
      });
      if (parsed.success && !resolvedApprovalIds.includes(parsed.data.id)) return parsed.data;
    }
  }
  return null;
};

const applyEvent = (state: AgentState, event: AgentStreamEvent): Partial<AgentState> => {
  switch (event.event) {
    case 'message.start':
      return state.messages.some((message) => message.id === event.data.messageId)
        ? {}
        : {
            messages: [
              ...state.messages,
              {
                id: event.data.messageId,
                sessionId: state.sessionId ?? crypto.randomUUID(),
                role: 'assistant',
                parts: [{ type: 'text', id: crypto.randomUUID(), text: '' }],
                seq: state.messages.length,
                status: 'complete',
              },
            ],
          };
    case 'message.delta':
      return {
        messages: updateMessage(state.messages, event.data.messageId, (message) => {
          const textPart = message.parts.find((part) => part.type === 'text');
          const parts = textPart
            ? message.parts.map((part) =>
                part.id === textPart.id && part.type === 'text'
                  ? { ...part, text: part.text + event.data.text }
                  : part,
              )
            : [
                ...message.parts,
                { type: 'text' as const, id: crypto.randomUUID(), text: event.data.text },
              ];
          return { ...message, parts };
        }),
      };
    case 'tool.update':
      return {
        messages: updateMessage(state.messages, event.data.messageId, (message) => {
          const exists = message.parts.some((part) => part.id === event.data.part.id);
          const parts: MessagePart[] = exists
            ? message.parts.map((part) => (part.id === event.data.part.id ? event.data.part : part))
            : [...message.parts, event.data.part];
          return { ...message, parts };
        }),
      };
    case 'permission.asked':
      return { approval: event.data };
    case 'warning':
      return { error: event.data.message };
    case 'done':
      return { streaming: false };
    case 'error':
      return { streaming: false, error: event.data.message };
  }
};

export const useAgentStore = create<AgentState>((set) => ({
  sessionId: null,
  messages: [],
  streaming: false,
  error: null,
  approval: null,
  resolvedApprovalIds: [],
  hydrate: (sessionId, messages) =>
    set((state) => ({
      sessionId,
      messages,
      streaming: false,
      error: null,
      resolvedApprovalIds: state.sessionId === sessionId ? state.resolvedApprovalIds : [],
      approval: pendingApproval(
        sessionId,
        messages,
        state.sessionId === sessionId ? state.resolvedApprovalIds : [],
      ),
    })),
  begin: (sessionId, content) =>
    set((state) => ({
      sessionId,
      streaming: true,
      error: null,
      messages: [
        ...state.messages,
        {
          id: crypto.randomUUID(),
          sessionId,
          role: 'user',
          parts: [{ type: 'text', id: crypto.randomUUID(), text: content }],
          seq: state.messages.length,
          status: 'complete',
        },
      ],
    })),
  applyEvent: (event) => set((state) => applyEvent(state, event)),
  clearApproval: (approvalId) =>
    set((state) => ({
      approval: null,
      resolvedApprovalIds: approvalId
        ? [...state.resolvedApprovalIds.slice(-99), approvalId]
        : state.resolvedApprovalIds,
    })),
  stop: () => set({ streaming: false, approval: null }),
  reset: (sessionId) =>
    set({
      sessionId: sessionId ?? null,
      messages: [],
      streaming: false,
      error: null,
      approval: null,
      resolvedApprovalIds: [],
    }),
}));
