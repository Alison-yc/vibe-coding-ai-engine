import { describe, expect, it } from 'vitest';
import { InMemoryChatRepository } from './chat.repository';

describe('InMemoryChatRepository', () => {
  it('按 seq 追加消息并在删除会话时级联清空', async () => {
    const repository = new InMemoryChatRepository();
    const session = await repository.createSession({
      title: '新对话',
      modelId: 'qwen3.5:2b',
      datasetIds: [],
    });
    const first = await repository.appendMessage({
      sessionId: session.id,
      role: 'user',
      parts: [{ type: 'text', id: 'u1', text: 'hi' }],
    });
    const second = await repository.appendMessage({
      id: '00000000-0000-4000-8000-000000000099',
      sessionId: session.id,
      role: 'assistant',
      parts: [{ type: 'text', id: 'a1', text: 'hello' }],
      status: 'interrupted',
    });
    expect(first.seq).toBe(0);
    expect(second.seq).toBe(1);
    expect(second.status).toBe('interrupted');
    await repository.deleteSession(session.id);
    expect(await repository.getSession(session.id)).toBeNull();
    expect(await repository.listMessages(session.id)).toEqual([]);
  });
});
