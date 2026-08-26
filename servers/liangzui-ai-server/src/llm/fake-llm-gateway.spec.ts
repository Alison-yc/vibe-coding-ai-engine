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
});
