import { describe, expect, it } from 'vitest';
import { useChatStreamStore, shouldHydrateMessages } from './chat-stream-store';

const SESSION = '00000000-0000-4000-8000-000000000001';
const MESSAGE = '00000000-0000-4000-8000-000000000002';

describe('useChatStreamStore', () => {
  it('hydrate、appendUser、clearError、markIdle', () => {
    useChatStreamStore.getState().hydrate(SESSION, []);
    useChatStreamStore.setState({ error: 'x', streaming: true });
    useChatStreamStore.getState().clearError();
    useChatStreamStore.setState({ error: '生成失败' });
    useChatStreamStore.getState().hydrate(SESSION, []);
    expect(useChatStreamStore.getState().error).toBe('生成失败');
    useChatStreamStore.getState().clearError();
    useChatStreamStore.getState().markIdle();
    useChatStreamStore.getState().appendUser({
      id: MESSAGE,
      sessionId: SESSION,
      role: 'user',
      parts: [{ type: 'text', id: 'p', text: 'hi' }],
      seq: 0,
      status: 'complete',
    });
    expect(useChatStreamStore.getState()).toMatchObject({
      sessionId: SESSION,
      streaming: false,
      error: null,
    });
    expect(useChatStreamStore.getState().messages).toHaveLength(1);
  });

  it('shouldHydrateMessages 在同会话已有 SSE 消息时不覆盖', () => {
    expect(
      shouldHydrateMessages(SESSION, { sessionId: SESSION, messages: [{ id: MESSAGE } as never] }),
    ).toBe(false);
    expect(shouldHydrateMessages(SESSION, { sessionId: null, messages: [] })).toBe(true);
    expect(
      shouldHydrateMessages(SESSION, { sessionId: 'other', messages: [{ id: 'x' } as never] }),
    ).toBe(true);
  });
});
