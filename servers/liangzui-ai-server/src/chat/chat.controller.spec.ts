import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ChatController } from './chat.controller';
import { ModelsController } from './models.controller';

const SESSION = '00000000-0000-4000-8000-000000000001';
const principal = { userId: 'user-a', permissions: ['chat:basic'] } as never;

describe('ChatController', () => {
  it('把 NOT_FOUND 映射为 404', async () => {
    const chat = {
      getSession: vi.fn().mockRejectedValue(new Error('NOT_FOUND:会话不存在')),
    };
    const controller = new ChatController(chat as never);
    await expect(controller.getSession(principal, SESSION)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('转发 CRUD 成功路径', async () => {
    const chat = {
      createSession: vi.fn().mockResolvedValue({ id: SESSION }),
      listModels: vi.fn().mockResolvedValue([]),
      listSessions: vi.fn().mockResolvedValue([]),
      getSession: vi.fn().mockResolvedValue({ id: SESSION }),
      updateSession: vi.fn().mockResolvedValue({ id: SESSION, title: '改名' }),
      deleteSession: vi.fn().mockResolvedValue({ ok: true }),
      listMessages: vi.fn().mockResolvedValue([]),
    };
    const controller = new ChatController(chat as never);
    const modelsController = new ModelsController(chat as never);
    await expect(controller.createSession(principal, {})).resolves.toEqual({ id: SESSION });
    await expect(modelsController.listModels()).resolves.toEqual({ models: [] });
    await expect(controller.listSessions(principal)).resolves.toEqual({ sessions: [] });
    await expect(controller.getSession(principal, SESSION)).resolves.toEqual({ id: SESSION });
    await expect(controller.updateSession(principal, SESSION, { title: '改名' })).resolves.toEqual({
      id: SESSION,
      title: '改名',
    });
    await expect(controller.deleteSession(principal, SESSION)).resolves.toEqual({ ok: true });
    await expect(controller.listMessages(principal, SESSION)).resolves.toEqual({ messages: [] });
    const ownedMethods = Object.entries(chat).filter(([name]) => name !== 'listModels');
    const actorMethods = new Set(['createSession', 'updateSession']);
    for (const [name, method] of ownedMethods) {
      expect(method).toHaveBeenCalled();
      const expected = actorMethods.has(name)
        ? { ownerId: 'user-a', permissions: ['chat:basic'] }
        : 'user-a';
      for (const call of method.mock.calls) expect(call[0]).toEqual(expected);
    }
  });

  it('stream 设置 SSE 头，失败时写 error 事件并结束响应', async () => {
    const prepared = { session: { id: SESSION } };
    const chat = {
      prepareStream: vi.fn().mockResolvedValue(prepared),
      runStream: vi.fn().mockRejectedValue(new Error('fetch failed')),
    };
    const controller = new ChatController(chat as never);
    const writes: string[] = [];
    const response = {
      status: vi.fn(),
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      flush: vi.fn(),
      write: (chunk: string) => {
        writes.push(chunk);
      },
      end: vi.fn(),
    };
    const request = { on: vi.fn() };
    await controller.stream(
      principal,
      SESSION,
      { content: '你好', fileAccess: false, mode: 'edit' },
      request as never,
      response as never,
    );
    expect(response.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(writes.join('')).toContain('event: error');
    expect(response.flush).toHaveBeenCalled();
    expect(response.end).toHaveBeenCalled();
    expect(chat.runStream).toHaveBeenCalledWith(prepared, expect.anything(), expect.any(Function));
  });

  it('stream 预检失败时在写响应头之前返回 404 / 403', async () => {
    const response = { status: vi.fn(), setHeader: vi.fn(), flushHeaders: vi.fn() };
    const body = { content: '你好', fileAccess: true, mode: 'edit' as const };
    for (const [message, type] of [
      ['NOT_FOUND:会话不存在', NotFoundException],
      ['FORBIDDEN:当前账号无权开启文件访问', ForbiddenException],
    ] as const) {
      const chat = { prepareStream: vi.fn().mockRejectedValue(new Error(message)) };
      const controller = new ChatController(chat as never);
      await expect(
        controller.stream(principal, SESSION, body, { on: vi.fn() } as never, response as never),
      ).rejects.toBeInstanceOf(type);
    }
    expect(response.flushHeaders).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });
});
