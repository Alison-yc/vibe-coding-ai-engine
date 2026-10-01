import { describe, expect, it } from 'vitest';
import { InMemoryChatRepository } from './chat.repository';

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000b2';

describe('InMemoryChatRepository', () => {
  it('按 seq 追加消息并在删除会话时级联清空', async () => {
    const repository = new InMemoryChatRepository();
    const session = await repository.createSession(OWNER, {
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
    await repository.deleteSession(OWNER, session.id);
    expect(await repository.getSession(OWNER, session.id)).toBeNull();
    expect(await repository.listMessages(session.id)).toEqual([]);
  });

  it('按所有者隔离会话，他人的改删不生效', async () => {
    const repository = new InMemoryChatRepository();
    const own = await repository.createSession(OWNER, {
      title: '甲',
      modelId: 'm',
      datasetIds: [],
    });
    const other = await repository.createSession(OTHER, {
      title: '乙',
      modelId: 'm',
      datasetIds: [],
    });

    expect((await repository.listSessions(OWNER)).map((item) => item.id)).toEqual([own.id]);
    await expect(repository.getSession(OTHER, own.id)).resolves.toBeNull();
    await expect(repository.updateSession(OTHER, own.id, { title: '改' })).resolves.toBeNull();
    await expect(repository.deleteSession(OTHER, own.id)).resolves.toBe(false);
    await expect(repository.getSession(OWNER, own.id)).resolves.toMatchObject({ title: '甲' });
    await expect(repository.getSessionForSystem(other.id)).resolves.toMatchObject({ title: '乙' });
    expect((await repository.listSessionIdsForSystem()).sort()).toEqual([own.id, other.id].sort());
  });
});
