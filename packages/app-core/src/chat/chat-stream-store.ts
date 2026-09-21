import { create } from 'zustand';
import { AgentApprovalSchema, type ChatMessage, type ChatStreamEvent } from '@ai-engine/contracts';
import { applyChatEvent, emptyChatStreamState, type ChatStreamState } from './chat-event-reducer';

type ChatStreamStore = ChatStreamState & {
  activeRequestId: string | null;
  resolvedApprovalIds: string[];
  hydrate: (sessionId: string, messages: ChatMessage[]) => void;
  applyEvent: (event: ChatStreamEvent, requestId?: string) => void;
  beginRequest: (sessionId: string) => string;
  appendUser: (message: ChatMessage) => void;
  clearError: () => void;
  clearApproval: (approvalId?: string) => void;
  markIdle: (requestId?: string) => void;
};

const pendingApproval = (
  sessionId: string,
  messages: ChatMessage[],
  resolvedApprovalIds: ReadonlySet<string>,
) => {
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== 'tool' || part.state !== 'pending' || !part.permission) continue;
      if (resolvedApprovalIds.has(part.permission.id)) continue;
      const parsed = AgentApprovalSchema.safeParse({
        id: part.permission.id,
        sessionId,
        toolCallId: part.id,
        tool: part.name,
        resource: part.permission.resource,
        diff: part.permission.diff ?? '',
      });
      if (parsed.success) return parsed.data;
    }
  }
  return null;
};

export const hasActiveToolParts = (messages: ChatMessage[]): boolean =>
  messages.some((message) =>
    message.parts?.some(
      (part) => part.type === 'tool' && (part.state === 'pending' || part.state === 'running'),
    ),
  );

/** 仅在切换会话或本地为空时从服务端灌入，避免流式结束后用旧缓存覆盖 SSE 状态导致闪烁 */
export const shouldHydrateMessages = (
  sessionId: string,
  local: Pick<ChatStreamState, 'sessionId' | 'messages'>,
  remoteMessages: ChatMessage[] = [],
): boolean =>
  local.sessionId !== sessionId ||
  local.messages.length === 0 ||
  hasActiveToolParts(local.messages) ||
  hasActiveToolParts(remoteMessages);

export const useChatStreamStore = create<ChatStreamStore>((set) => ({
  ...emptyChatStreamState(),
  activeRequestId: null,
  resolvedApprovalIds: [],
  hydrate: (sessionId, messages) =>
    set((state) => {
      const resolvedApprovalIds = state.sessionId === sessionId ? state.resolvedApprovalIds : [];
      return {
        sessionId,
        messages,
        streaming: false,
        activeRequestId: null,
        error: state.error,
        warning: null,
        approval: pendingApproval(sessionId, messages, new Set(resolvedApprovalIds)),
        resolvedApprovalIds,
      };
    }),
  applyEvent: (event, requestId) =>
    set((state) =>
      requestId && state.activeRequestId !== requestId
        ? state
        : event.event === 'permission.asked' && state.resolvedApprovalIds.includes(event.data.id)
          ? state
          : applyChatEvent(state, event),
    ),
  beginRequest: (sessionId) => {
    const requestId = crypto.randomUUID();
    set((state) => ({
      sessionId,
      messages: state.sessionId === sessionId ? state.messages : [],
      streaming: true,
      activeRequestId: requestId,
      error: null,
      warning: null,
      approval: state.sessionId === sessionId ? state.approval : null,
      resolvedApprovalIds: state.sessionId === sessionId ? state.resolvedApprovalIds : [],
    }));
    return requestId;
  },
  appendUser: (message) => set((state) => ({ messages: [...state.messages, message] })),
  clearError: () => set({ error: null, warning: null }),
  clearApproval: (approvalId) =>
    set((state) => {
      const resolvedId = approvalId ?? state.approval?.id;
      return {
        approval: null,
        resolvedApprovalIds:
          resolvedId && !state.resolvedApprovalIds.includes(resolvedId)
            ? [...state.resolvedApprovalIds, resolvedId]
            : state.resolvedApprovalIds,
      };
    }),
  markIdle: (requestId) =>
    set((state) =>
      requestId && state.activeRequestId !== requestId
        ? state
        : { streaming: false, activeRequestId: null },
    ),
}));
