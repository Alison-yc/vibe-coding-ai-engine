import type { AgentStreamEvent, ChatMessage } from '@ai-engine/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { shouldHydrateAgentMessages, useAgentStore } from './agent-store';

const sessionId = crypto.randomUUID();
const messageId = crypto.randomUUID();

beforeEach(() => {
  useAgentStore.setState({
    sessionId: null,
    messages: [],
    streaming: false,
    error: null,
    approval: null,
    resolvedApprovalIds: [],
  });
});

const apply = (event: AgentStreamEvent) => useAgentStore.getState().applyEvent(event);

describe('agent store', () => {
  it('按事件更新文本与工具状态', () => {
    useAgentStore.getState().begin(sessionId, '读取文件');
    apply({ event: 'message.start', data: { messageId } });
    apply({ event: 'message.delta', data: { messageId, text: '处理中' } });
    apply({
      event: 'tool.update',
      data: {
        messageId,
        part: {
          type: 'tool',
          id: 'call-1',
          name: 'read',
          state: 'running',
          input: { path: 'README.md' },
        },
      },
    });
    apply({
      event: 'tool.update',
      data: {
        messageId,
        part: {
          type: 'tool',
          id: 'call-1',
          name: 'read',
          state: 'completed',
          output: '内容',
        },
      },
    });
    apply({ event: 'done', data: { messageId, status: 'complete' } });
    const state = useAgentStore.getState();
    expect(state.streaming).toBe(false);
    expect(state.messages.at(-1)?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text', text: '处理中' }),
        expect.objectContaining({ type: 'tool', state: 'completed' }),
      ]),
    );
  });

  it('刷新恢复持久化的未决审批', () => {
    const approvalId = crypto.randomUUID();
    const messages: ChatMessage[] = [
      {
        id: messageId,
        sessionId,
        role: 'assistant',
        seq: 0,
        status: 'complete',
        parts: [
          {
            type: 'tool',
            id: 'call-write',
            name: 'write',
            state: 'pending',
            permission: {
              id: approvalId,
              resource: 'README.md',
              diff: '+new',
            },
          },
        ],
      },
    ];
    useAgentStore.getState().hydrate(sessionId, messages);
    expect(useAgentStore.getState().approval).toEqual(
      expect.objectContaining({ id: approvalId, tool: 'write', diff: '+new' }),
    );
    useAgentStore.getState().clearApproval(approvalId);
    useAgentStore.getState().hydrate(sessionId, messages);
    expect(useAgentStore.getState().approval).toBeNull();
  });

  it('仅在切换会话、空状态或工具仍活跃时同步服务端消息', () => {
    const complete: ChatMessage = {
      id: messageId,
      sessionId,
      role: 'assistant',
      seq: 0,
      status: 'complete',
      parts: [{ type: 'text', id: 'text', text: '完成' }],
    };
    expect(shouldHydrateAgentMessages(sessionId, { sessionId, messages: [complete] })).toBe(false);
    expect(shouldHydrateAgentMessages(sessionId, { sessionId: null, messages: [complete] })).toBe(
      true,
    );
    expect(
      shouldHydrateAgentMessages(sessionId, {
        sessionId,
        messages: [
          {
            ...complete,
            parts: [{ type: 'tool', id: 'call', name: 'read', state: 'running' }],
          },
        ],
      }),
    ).toBe(true);
  });
});
