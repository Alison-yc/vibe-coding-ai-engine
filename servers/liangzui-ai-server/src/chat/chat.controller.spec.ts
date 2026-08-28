import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ChatController } from './chat.controller';
import { ModelsController } from './models.controller';

const SESSION = '00000000-0000-4000-8000-000000000001';

describe('ChatController', () => {
  it('把 NOT_FOUND 映射为 404', async () => {
    const chat = {
      getSession: vi.fn().mockRejectedValue(new Error('NOT_FOUND:会话不存在')),
    };
    const controller = new ChatController(chat as never);
    await expect(controller.getSession(SESSION)).rejects.toBeInstanceOf(NotFoundException);
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
    await expect(controller.createSession({})).resolves.toEqual({ id: SESSION });
    await expect(modelsController.listModels()).resolves.toEqual({ models: [] });
    await expect(controller.listSessions()).resolves.toEqual({ sessions: [] });
    await expect(controller.getSession(SESSION)).resolves.toEqual({ id: SESSION });
    await expect(controller.updateSession(SESSION, { title: '改名' })).resolves.toEqual({
      id: SESSION,
      title: '改名',
    });
    await expect(controller.deleteSession(SESSION)).resolves.toEqual({ ok: true });
    await expect(controller.listMessages(SESSION)).resolves.toEqual({ messages: [] });
  });

  it('stream 设置 SSE 头，失败时写 error 事件并结束响应', async () => {
    const chat = {
      stream: vi.fn().mockRejectedValue(new Error('fetch failed')),
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
      SESSION,
      { content: '你好', fileAccess: false, mode: 'edit' },
      request as never,
      response as never,
    );
    expect(response.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(writes.join('')).toContain('event: error');
    expect(response.flush).toHaveBeenCalled();
    expect(response.end).toHaveBeenCalled();
  });
});
