import { describe, expect, it } from 'vitest';
import { FakeLlmGateway } from './fake-llm-gateway';

const REQUEST = {
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  content: 'ping',
};

describe('FakeLlmGateway', () => {
  it('提供可编程响应并记录调用', async () => {
    const gateway = new FakeLlmGateway();
    gateway.enqueueText('pong', REQUEST.sessionId);

    const response = await gateway.chat(REQUEST);
    expect(response.message.parts[0]).toMatchObject({ type: 'text', text: 'pong' });
    expect(gateway.calls).toEqual([{ method: 'chat', request: REQUEST, aborted: false }]);
  });

  it('流式返回预置事件并支持取消', async () => {
    const gateway = new FakeLlmGateway();
    gateway.enqueueStream([
      { event: 'chunk', data: { text: 'a' } },
      { event: 'done', data: {} },
    ]);
    const events = [];
    for await (const event of gateway.stream(REQUEST)) events.push(event);
    expect(events).toHaveLength(2);

    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    const iterator = gateway.stream(REQUEST, controller.signal)[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow('cancelled');
  });

  it('按批次返回 embedding 并记录 token 计数', async () => {
    const gateway = new FakeLlmGateway();
    gateway.enqueueEmbeddings([[1, 0]]);

    await expect(gateway.embed(['文本'])).resolves.toEqual([[1, 0]]);
    await expect(gateway.countTokens('四个汉字')).resolves.toBe(2);
    expect(gateway.calls.map((call) => call.method)).toEqual(['embed', 'countTokens']);
  });

  it('能模拟超时、连接失败与格式错误的 tool call 文本', async () => {
    const gateway = new FakeLlmGateway();
    gateway.enqueueError(new Error('chat 超时'));
    await expect(gateway.chat(REQUEST)).rejects.toThrow('超时');

    gateway.enqueueError(new Error('fetch failed'));
    await expect(gateway.chat(REQUEST)).rejects.toThrow('fetch failed');

    gateway.enqueueStreamError(new Error('stream down'));
    const failing = gateway.stream(REQUEST)[Symbol.asyncIterator]();
    await expect(failing.next()).rejects.toThrow('stream down');

    gateway.enqueueText('```json\n{"name": "not-a-tool"');
    const response = await gateway.chat(REQUEST);
    const text = response.message.parts[0];
    expect(text && text.type === 'text' ? text.text : '').toContain('not-a-tool');
  });
});
