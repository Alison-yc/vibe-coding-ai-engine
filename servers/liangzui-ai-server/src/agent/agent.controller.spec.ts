import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AgentController } from './agent.controller';
import type { AgentService } from './agent.service';

const sessionId = '11111111-1111-4111-8111-111111111111';
type EmitAgentEvent = Parameters<AgentService['stream']>[3];

const responseStub = () => {
  const writes: string[] = [];
  return {
    writes,
    response: {
      destroyed: false,
      writableEnded: false,
      status: vi.fn(),
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn((value: string) => {
        writes.push(value);
        return true;
      }),
      end: vi.fn(),
    },
  };
};

describe('AgentController', () => {
  it('把 Agent 事件编码为 SSE 并结束响应', async () => {
    const agent = {
      stream: vi.fn(
        async (_sessionId: string, _body: unknown, _signal: AbortSignal, emit: EmitAgentEvent) => {
          emit({ event: 'done', data: { messageId: sessionId, status: 'complete' } });
        },
      ),
      respondPermission: vi.fn(),
      listExposedTools: vi.fn(),
    };
    const controller = new AgentController(agent as never);
    const { response, writes } = responseStub();
    await controller.stream(
      sessionId,
      { content: '读取', workspaceRoot: '/workspace', mode: 'edit' },
      { on: vi.fn() } as never,
      response as never,
    );
    expect(writes.join('')).toContain('event: done');
    expect(response.end).toHaveBeenCalledOnce();
  });

  it('执行异常时发送 error 事件', async () => {
    const agent = {
      stream: vi.fn().mockRejectedValue(new Error('模型失败')),
      respondPermission: vi.fn(),
      listExposedTools: vi.fn(),
    };
    const controller = new AgentController(agent as never);
    const { response, writes } = responseStub();
    await controller.stream(
      sessionId,
      { content: '读取', workspaceRoot: '/workspace', mode: 'edit' },
      { on: vi.fn() } as never,
      response as never,
    );
    expect(writes.join('')).toContain('模型失败');
    expect(response.end).toHaveBeenCalledOnce();
  });

  it('客户端断开后忽略后台继续产生的事件', async () => {
    const { response, writes } = responseStub();
    const agent = {
      stream: vi.fn(
        async (_sessionId: string, _body: unknown, _signal: AbortSignal, emit: EmitAgentEvent) => {
          response.destroyed = true;
          emit({ event: 'done', data: { messageId: sessionId, status: 'complete' } });
        },
      ),
      respondPermission: vi.fn(),
    };
    const controller = new AgentController(agent as never);
    await controller.stream(
      sessionId,
      { content: '读取', workspaceRoot: '/workspace', mode: 'edit' },
      { on: vi.fn() } as never,
      response as never,
    );
    expect(writes).toEqual([]);
    expect(response.end).not.toHaveBeenCalled();
  });

  it('列出暴露给模型的工具，非法 sessionId 返回 404', async () => {
    const agent = {
      stream: vi.fn(),
      respondPermission: vi.fn(),
      listExposedTools: vi.fn().mockResolvedValue({
        tools: [{ name: 'read', description: '读取', source: 'builtin' }],
        dropped: [],
        maxToolCount: 6,
      }),
    };
    const controller = new AgentController(agent as never);
    await expect(controller.listTools()).resolves.toEqual(
      expect.objectContaining({ maxToolCount: 6 }),
    );
    expect(agent.listExposedTools).toHaveBeenCalledWith(undefined);
    expect(() => controller.listTools('not-a-uuid')).toThrow(NotFoundException);
  });

  it('只接受当前仍在等待的审批', () => {
    const accepted = new AgentController({
      stream: vi.fn(),
      respondPermission: vi.fn().mockReturnValue(true),
    } as never);
    expect(
      accepted.respondPermission(sessionId, crypto.randomUUID(), {
        decision: 'allow-once',
      }),
    ).toEqual({ accepted: true });

    const missing = new AgentController({
      stream: vi.fn(),
      respondPermission: vi.fn().mockReturnValue(false),
    } as never);
    expect(() =>
      missing.respondPermission(sessionId, crypto.randomUUID(), { decision: 'deny' }),
    ).toThrow(NotFoundException);
  });
});
