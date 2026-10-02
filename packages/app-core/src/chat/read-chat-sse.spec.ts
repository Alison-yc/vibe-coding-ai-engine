import { describe, expect, it } from 'vitest';
import { readChatSse } from './read-chat-sse';

describe('readChatSse', () => {
  it('解析 event/data 块并忽略损坏 JSON', async () => {
    const events: unknown[] = [];
    const body = [
      'event: message.start',
      'data: {"messageId":"00000000-0000-4000-8000-000000000001","role":"assistant"}',
      '',
      'event: error',
      'data: {not-json}',
      '',
      '',
    ].join('\n');
    await readChatSse(new Response(body), (event) => events.push(event));
    expect(events).toEqual([
      {
        event: 'message.start',
        data: { messageId: '00000000-0000-4000-8000-000000000001', role: 'assistant' },
      },
    ]);
  });
});
