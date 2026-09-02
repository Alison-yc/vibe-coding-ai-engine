import { describe, expect, it } from 'vitest';
import { applyChatEvent, emptyChatStreamState } from './chat-event-reducer';

const SESSION = '00000000-0000-4000-8000-000000000001';
const MESSAGE = '00000000-0000-4000-8000-000000000002';
const PART = 'part-1';

describe('applyChatEvent', () => {
  it('按 partId 追加文本，不丢弃其它消息', () => {
    const started = applyChatEvent(
      { ...emptyChatStreamState(), sessionId: SESSION },
      { event: 'message.start', data: { messageId: MESSAGE, role: 'assistant' } },
    );
    const withPart = applyChatEvent(started, {
      event: 'message.part.start',
      data: { messageId: MESSAGE, partId: PART, type: 'text' },
    });
    const first = applyChatEvent(withPart, {
      event: 'message.part.delta',
      data: { messageId: MESSAGE, partId: PART, text: '你' },
    });
    const second = applyChatEvent(first, {
      event: 'message.part.delta',
      data: { messageId: MESSAGE, partId: PART, text: '好' },
    });
    expect(second.messages).toHaveLength(1);
    expect(second.messages[0]?.parts[0]).toMatchObject({ type: 'text', text: '你好' });
  });

  it('done 写入 interrupted，error 结束 streaming', () => {
    const started = applyChatEvent(
      { ...emptyChatStreamState(), sessionId: SESSION },
      { event: 'message.start', data: { messageId: MESSAGE, role: 'assistant' } },
    );
    const done = applyChatEvent(started, {
      event: 'done',
      data: { messageId: MESSAGE, status: 'interrupted' },
    });
    expect(done.streaming).toBe(false);
    expect(done.messages[0]?.status).toBe('interrupted');
    const errored = applyChatEvent(started, {
      event: 'error',
      data: { message: '无法连接 Ollama，请确认本机模型服务已启动' },
    });
    expect(errored.streaming).toBe(false);
    expect(errored.error).toContain('Ollama');
  });

  it('citations 追加 citation part', () => {
    const started = applyChatEvent(
      { ...emptyChatStreamState(), sessionId: SESSION },
      { event: 'message.start', data: { messageId: MESSAGE, role: 'assistant' } },
    );
    const cited = applyChatEvent(started, {
      event: 'message.citations',
      data: {
        messageId: MESSAGE,
        chunks: [
          {
            documentId: '00000000-0000-4000-8000-000000000003',
            chunkId: '00000000-0000-4000-8000-000000000004',
            documentName: 'a.md',
            text: '北京',
          },
        ],
      },
    });
    expect(cited.messages[0]?.parts.at(-1)).toMatchObject({ type: 'citation' });
  });

  it('统一处理 Agent 文本、工具、审批与警告事件', () => {
    let state = applyChatEvent(
      { ...emptyChatStreamState(), sessionId: SESSION },
      { event: 'message.start', data: { messageId: MESSAGE, role: 'assistant' } },
    );
    state = applyChatEvent(state, {
      event: 'message.delta',
      data: { messageId: MESSAGE, text: '处理中' },
    });
    state = applyChatEvent(state, {
      event: 'tool.update',
      data: {
        messageId: MESSAGE,
        part: { type: 'tool', id: PART, name: 'write', state: 'pending' },
      },
    });
    state = applyChatEvent(state, {
      event: 'permission.asked',
      data: {
        id: '00000000-0000-4000-8000-000000000003',
        sessionId: SESSION,
        toolCallId: PART,
        tool: 'write',
        resource: 'README.md',
      },
    });
    state = applyChatEvent(state, { event: 'warning', data: { message: '本轮不使用知识库' } });
    expect(state.messages[0]?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text', text: '处理中' }),
        expect.objectContaining({ type: 'tool', name: 'write' }),
      ]),
    );
    expect(state.approval?.tool).toBe('write');
    expect(state.warning).toContain('知识库');
  });
});
