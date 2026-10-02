import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { McpController } from './mcp.controller';

describe('McpController', () => {
  it('列出 server 并把不存在的名称转成 404', async () => {
    const mcp = {
      listServers: vi.fn().mockReturnValue([]),
      listServerTools: vi.fn().mockImplementation(() => {
        throw new Error('MCP server 不存在：missing');
      }),
      reconnect: vi.fn(),
      patch: vi.fn(),
    };
    const controller = new McpController(mcp as never);
    expect(controller.listServers()).toEqual({ servers: [] });
    await expect(controller.listTools('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('转发重连与仅允许的 patch 字段', async () => {
    const mcp = {
      listServers: vi.fn(),
      listServerTools: vi.fn(),
      reconnect: vi.fn().mockResolvedValue({ name: 'filesystem', status: 'connected' }),
      patch: vi.fn().mockResolvedValue({ name: 'filesystem', enabled: false }),
    };
    const controller = new McpController(mcp as never);
    await expect(controller.reconnect('filesystem')).resolves.toEqual(
      expect.objectContaining({ status: 'connected' }),
    );
    await expect(controller.patch('filesystem', { enabled: false })).resolves.toEqual(
      expect.objectContaining({ enabled: false }),
    );
  });

  it('非“不存在”错误原样抛出', async () => {
    const controller = new McpController({
      listServers: vi.fn(),
      listServerTools: vi.fn(),
      reconnect: vi.fn().mockRejectedValue(new Error('timeout')),
      patch: vi.fn(),
    } as never);
    await expect(controller.reconnect('filesystem')).rejects.toThrow('timeout');
  });

  it('非 Error 异常使用兜底文案', async () => {
    const controller = new McpController({
      listServers: vi.fn(),
      listServerTools: vi.fn(),
      reconnect: vi.fn().mockRejectedValue('offline'),
      patch: vi.fn(),
    } as never);
    await expect(controller.reconnect('filesystem')).rejects.toBe('offline');
  });
});
