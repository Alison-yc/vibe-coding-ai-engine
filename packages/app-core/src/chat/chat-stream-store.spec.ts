import { describe, expect, it } from 'vitest';
import { hasActiveToolParts, shouldHydrateMessages, useChatStreamStore } from './chat-stream-store';

const SESSION = '00000000-0000-4000-8000-000000000001';
const MESSAGE = '00000000-0000-4000-8000-000000000002';

describe('useChatStreamStore', () => {
  it('hydrate、appendUser、clearError、markIdle', () => {
    useChatStreamStore.setState({ resolvedApprovalIds: [] });
    useChatStreamStore.getState().hydrate(SESSION, []);
    useChatStreamStore.getState().beginRequest(SESSION);
    expect(useChatStreamStore.getState().streaming).toBe(true);
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

  it('已处理的审批不会被旧 pending 消息重新恢复', () => {
    const approvalId = '00000000-0000-4000-8000-000000000003';
    const messages = [
      {
        id: MESSAGE,
        sessionId: SESSION,
        role: 'assistant' as const,
        parts: [
          {
            type: 'tool' as const,
            id: 'call-write',
            name: 'write',
            state: 'pending' as const,
            permission: { id: approvalId, resource: 'README.md' },
          },
        ],
        seq: 0,
        status: 'complete' as const,
      },
    ];
    useChatStreamStore.setState({ sessionId: null, resolvedApprovalIds: [] });
    useChatStreamStore.getState().hydrate(SESSION, messages);
    expect(useChatStreamStore.getState().approval?.id).toBe(approvalId);
    useChatStreamStore.getState().clearApproval(approvalId);
    useChatStreamStore.getState().hydrate(SESSION, messages);
    expect(useChatStreamStore.getState().approval).toBeNull();
    useChatStreamStore.getState().applyEvent({
      event: 'permission.asked',
      data: {
        id: approvalId,
        sessionId: SESSION,
        toolCallId: 'call-write',
        tool: 'write',
        resource: 'README.md',
      },
    });
    expect(useChatStreamStore.getState().approval).toBeNull();
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

  it('pending 或 running 工具会保持会话占用', () => {
    const message = {
      id: MESSAGE,
      sessionId: SESSION,
      role: 'assistant' as const,
      parts: [
        { type: 'tool' as const, id: 'call-1', name: 'read_file', state: 'pending' as const },
      ],
      seq: 0,
      status: 'complete' as const,
    };

    expect(hasActiveToolParts([message])).toBe(true);
    expect(
      hasActiveToolParts([
        {
          ...message,
          parts: [{ ...message.parts[0], state: 'running' as const }],
        },
      ]),
    ).toBe(true);
    expect(
      hasActiveToolParts([
        {
          ...message,
          parts: [{ ...message.parts[0], state: 'completed' as const }],
        },
      ]),
    ).toBe(false);
  });

  it('服务端出现活动工具时覆盖仅含乐观消息的本地状态', () => {
    const localMessage = {
      id: MESSAGE,
      sessionId: SESSION,
      role: 'user' as const,
      parts: [{ type: 'text' as const, id: 'text-1', text: '读取文件' }],
      seq: 0,
      status: 'complete' as const,
    };
    const remoteMessage = {
      ...localMessage,
      id: '00000000-0000-4000-8000-000000000004',
      role: 'assistant' as const,
      parts: [
        { type: 'tool' as const, id: 'call-1', name: 'read_file', state: 'running' as const },
      ],
      seq: 1,
    };

    expect(
      shouldHydrateMessages(SESSION, { sessionId: SESSION, messages: [localMessage] }, [
        localMessage,
        remoteMessage,
      ]),
    ).toBe(true);
  });

  it('旧请求结束不会清除新请求的 streaming 状态', () => {
    const oldRequestId = useChatStreamStore.getState().beginRequest(SESSION);
    const newRequestId = useChatStreamStore.getState().beginRequest(SESSION);

    useChatStreamStore.getState().applyEvent(
      {
        event: 'done',
        data: { messageId: MESSAGE, status: 'complete' },
      },
      oldRequestId,
    );
    expect(useChatStreamStore.getState().streaming).toBe(true);

    useChatStreamStore.getState().markIdle(oldRequestId);
    expect(useChatStreamStore.getState().streaming).toBe(true);
    expect(useChatStreamStore.getState().activeRequestId).toBe(newRequestId);

    useChatStreamStore.getState().markIdle(newRequestId);
    expect(useChatStreamStore.getState().streaming).toBe(false);
    expect(useChatStreamStore.getState().activeRequestId).toBeNull();
  });

  it('新请求原子绑定目标会话并清除旧会话交互态', () => {
    useChatStreamStore.getState().hydrate(SESSION, [
      {
        id: MESSAGE,
        sessionId: SESSION,
        role: 'user',
        parts: [{ type: 'text', id: 'text-1', text: '旧消息' }],
        seq: 0,
        status: 'complete',
      },
    ]);

    const nextSession = '00000000-0000-4000-8000-000000000005';
    useChatStreamStore.getState().beginRequest(nextSession);

    expect(useChatStreamStore.getState()).toMatchObject({
      sessionId: nextSession,
      messages: [],
      streaming: true,
      approval: null,
      resolvedApprovalIds: [],
    });
  });
});
