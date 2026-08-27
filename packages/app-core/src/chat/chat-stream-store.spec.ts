import { describe, expect, it } from 'vitest';
import { useChatStreamStore } from './chat-stream-store';

const SESSION = '00000000-0000-4000-8000-000000000001';
const MESSAGE = '00000000-0000-4000-8000-000000000002';

describe('useChatStreamStore', () => {
  it('hydrate、appendUser、clearError、markIdle', () => {
    useChatStreamStore.getState().hydrate(SESSION, []);
    useChatStreamStore.setState({ error: 'x', streaming: true });
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
});
