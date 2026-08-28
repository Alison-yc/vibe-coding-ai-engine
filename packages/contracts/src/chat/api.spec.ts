import { describe, expect, it } from 'vitest';
import { ChatRequestSchema, ChatStreamEventSchema, ChatStreamRequestSchema } from './api.js';
import { ChatMessageSchema } from './message.js';
import { ChatSessionSchema, CreateChatSessionRequestSchema } from './session.js';

describe('chat 契约', () => {
  it('流式请求允许挂载知识库 id', () => {
    const request = ChatStreamRequestSchema.parse({
      content: '资料里写了什么',
      datasetIds: ['00000000-0000-4000-8000-000000000001'],
    });
    expect(request.datasetIds).toHaveLength(1);
    expect(request.fileAccess).toBe(false);
    expect(request.mode).toBe('edit');
    expect(ChatStreamRequestSchema.safeParse({ content: '读文件', fileAccess: true }).success).toBe(
      false,
    );
    expect(
      ChatStreamRequestSchema.safeParse({
        content: '读文件',
        fileAccess: true,
        workspaceRoot: '/workspace',
      }).success,
    ).toBe(true);
  });

  it('拒绝无法识别的 SSE 事件名', () => {
    expect(ChatStreamEventSchema.safeParse({ event: 'part', data: {} }).success).toBe(false);
    expect(
      ChatStreamEventSchema.safeParse({
        event: 'done',
        data: { messageId: '00000000-0000-4000-8000-000000000002', status: 'interrupted' },
      }).success,
    ).toBe(true);
  });

  it('网关 ChatRequest 可携带多轮 messages', () => {
    expect(
      ChatRequestSchema.parse({
        sessionId: '00000000-0000-4000-8000-000000000003',
        content: '你好',
        messages: [{ role: 'user', content: '你好' }],
      }).messages,
    ).toEqual([{ role: 'user', content: '你好' }]);
  });

  it('会话与消息 schema 含时间戳与状态默认值', () => {
    expect(CreateChatSessionRequestSchema.parse({}).title).toBeUndefined();
    expect(
      ChatMessageSchema.parse({
        id: '00000000-0000-4000-8000-000000000004',
        sessionId: '00000000-0000-4000-8000-000000000005',
        role: 'assistant',
        parts: [{ type: 'text', id: 'p1', text: 'hi' }],
      }).status,
    ).toBe('complete');
    expect(
      ChatSessionSchema.parse({
        id: '00000000-0000-4000-8000-000000000006',
        title: '新对话',
        modelId: 'qwen3.5:2b',
        datasetIds: [],
        createdAt: '2026-08-27T00:00:00.000Z',
        updatedAt: '2026-08-27T00:00:00.000Z',
      }).title,
    ).toBe('新对话');
  });
});
