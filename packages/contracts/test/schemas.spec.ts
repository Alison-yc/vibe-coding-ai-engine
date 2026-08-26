import { describe, expect, it } from 'vitest';
import { ApiErrorSchema } from '../src/common/errors';
import {
  PaginationQuerySchema,
  TimestampSchema,
  UuidSchema,
  paginatedResponseSchema,
} from '../src/common/primitives';
import { ChatRequestSchema, ChatStreamEventSchema } from '../src/chat/api';
import { ChatMessageSchema, MessagePartSchema } from '../src/chat/message';
import { ChatSessionSchema } from '../src/chat/session';
import { TranslateRequestSchema, TranslateResponseSchema } from '../src/llm/api';
import {
  EMBEDDING_DIMENSION,
  GenerationParamsSchema,
  ModelCapabilitySchema,
} from '../src/llm/model';
import { LlmStreamEventSchema } from '../src/llm/stream-event';

describe('common primitives', () => {
  it('接受合法 UUID 与 ISO 时间', () => {
    expect(UuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
    expect(TimestampSchema.safeParse('2026-08-26T05:00:00.000Z').success).toBe(true);
  });

  it('拒绝非法 UUID', () => {
    expect(UuidSchema.safeParse('not-a-uuid').success).toBe(false);
  });

  it('分页在边界 pageSize=100 合法、101 非法', () => {
    expect(PaginationQuerySchema.safeParse({ page: 1, pageSize: 100 }).success).toBe(true);
    expect(PaginationQuerySchema.safeParse({ page: 1, pageSize: 101 }).success).toBe(false);
    expect(PaginationQuerySchema.safeParse({ page: 0, pageSize: 20 }).success).toBe(false);
  });

  it('包装分页响应', () => {
    const schema = paginatedResponseSchema(UuidSchema);
    expect(
      schema.safeParse({
        items: ['550e8400-e29b-41d4-a716-446655440000'],
        page: 1,
        pageSize: 20,
        total: 1,
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        items: ['bad'],
        page: 1,
        pageSize: 20,
        total: 1,
      }).success,
    ).toBe(false);
  });
});

describe('ApiError', () => {
  it('接受标准错误体', () => {
    expect(
      ApiErrorSchema.safeParse({
        code: 'BAD_REQUEST',
        message: '请求参数不合法',
        details: [{ path: ['text'] }],
      }).success,
    ).toBe(true);
  });

  it('拒绝未知错误码', () => {
    expect(ApiErrorSchema.safeParse({ code: 'OOPS', message: 'x' }).success).toBe(false);
  });

  it('拒绝空 message', () => {
    expect(ApiErrorSchema.safeParse({ code: 'INTERNAL', message: '' }).success).toBe(false);
  });
});

describe('llm', () => {
  it('向量维度是 768', () => {
    expect(EMBEDDING_DIMENSION).toBe(768);
  });

  it('生成参数边界', () => {
    expect(GenerationParamsSchema.safeParse({ temperature: 0, numCtx: 1 }).success).toBe(true);
    expect(GenerationParamsSchema.safeParse({ temperature: 2.1 }).success).toBe(false);
    expect(GenerationParamsSchema.safeParse({ numPredict: 0 }).success).toBe(false);
  });

  it('模型能力描述', () => {
    expect(
      ModelCapabilitySchema.safeParse({
        id: 'qwen3.5:2b',
        supportsTools: true,
        supportsVision: false,
      }).success,
    ).toBe(true);
    expect(
      ModelCapabilitySchema.safeParse({
        id: '',
        supportsTools: true,
        supportsVision: false,
      }).success,
    ).toBe(false);
  });

  it('翻译请求合法/非法/过长', () => {
    expect(TranslateRequestSchema.safeParse({ text: '你好' }).success).toBe(true);
    expect(TranslateRequestSchema.safeParse({ text: 123 }).success).toBe(false);
    expect(TranslateRequestSchema.safeParse({ text: '' }).success).toBe(false);
    expect(TranslateRequestSchema.safeParse({ text: 'a'.repeat(8001) }).success).toBe(false);
  });

  it('翻译响应', () => {
    expect(TranslateResponseSchema.safeParse({ text: 'Hello' }).success).toBe(true);
    expect(TranslateResponseSchema.safeParse({ text: 1 }).success).toBe(false);
  });

  it('LLM 流必须能以 done 或 error 收尾', () => {
    expect(LlmStreamEventSchema.safeParse({ event: 'chunk', data: { text: 'Hi' } }).success).toBe(
      true,
    );
    expect(LlmStreamEventSchema.safeParse({ event: 'done', data: {} }).success).toBe(true);
    expect(
      LlmStreamEventSchema.safeParse({ event: 'error', data: { message: 'timeout' } }).success,
    ).toBe(true);
    expect(LlmStreamEventSchema.safeParse({ event: 'chunk', data: {} }).success).toBe(false);
  });
});

describe('chat', () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440000';

  it('ChatRequest 合法样例', () => {
    expect(ChatRequestSchema.safeParse({ sessionId, content: '你好' }).success).toBe(true);
  });

  it('ChatRequest 拒绝非 UUID sessionId', () => {
    expect(ChatRequestSchema.safeParse({ sessionId: 'abc', content: '你好' }).success).toBe(false);
  });

  it('ChatRequest 内容上限 8000', () => {
    expect(ChatRequestSchema.safeParse({ sessionId, content: 'a'.repeat(8000) }).success).toBe(
      true,
    );
    expect(ChatRequestSchema.safeParse({ sessionId, content: 'a'.repeat(8001) }).success).toBe(
      false,
    );
  });

  it('消息 part 联合类型', () => {
    expect(MessagePartSchema.safeParse({ type: 'text', id: 'p1', text: 'hi' }).success).toBe(true);
    expect(
      MessagePartSchema.safeParse({
        type: 'tool',
        id: 'p2',
        name: 'read_file',
        state: 'pending',
      }).success,
    ).toBe(true);
    expect(MessagePartSchema.safeParse({ type: 'text', id: 'p1' }).success).toBe(false);
  });

  it('会话与消息', () => {
    expect(
      ChatSessionSchema.safeParse({
        id: sessionId,
        title: '新会话',
        createdAt: '2026-08-26T05:00:00.000Z',
        updatedAt: '2026-08-26T05:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      ChatMessageSchema.safeParse({
        id: sessionId,
        sessionId,
        role: 'assistant',
        parts: [{ type: 'text', id: 'p1', text: 'ok' }],
      }).success,
    ).toBe(true);
    expect(
      ChatMessageSchema.safeParse({
        id: sessionId,
        sessionId,
        role: 'assistant',
        parts: [],
      }).success,
    ).toBe(false);
  });

  it('对话流包含终止事件', () => {
    expect(
      ChatStreamEventSchema.safeParse({
        event: 'done',
        data: { messageId: 'm1' },
      }).success,
    ).toBe(true);
    expect(
      ChatStreamEventSchema.safeParse({
        event: 'error',
        data: { message: 'failed' },
      }).success,
    ).toBe(true);
    expect(ChatStreamEventSchema.safeParse({ event: 'done', data: {} }).success).toBe(false);
  });
});
