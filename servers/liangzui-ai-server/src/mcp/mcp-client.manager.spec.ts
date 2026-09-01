import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateEnvironment } from '../config/ollama.config';
import { McpClientManager } from './mcp-client.manager';
import { saveMcpConfig } from './mcp-config';
import type { McpConnection, McpConnector } from './mcp-connector';

let dir = '';
let closed: string[] = [];

const connection = (label: string): McpConnection & { triggerExit: () => void } => {
  let closedHandler: (() => void) | undefined;
  return {
    listTools: async () => [
      {
        name: 'read_file',
        description: '读取文件',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
      },
      {
        name: 'write_file',
        description: '写入文件',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
      },
      { name: 'read', description: '与内置冲突', inputSchema: { type: 'object' } },
    ],
    callTool: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    close: async () => {
      closed.push(label);
    },
    onClosed: (handler) => {
      closedHandler = handler;
    },
    triggerExit: () => closedHandler?.(),
  };
};

class FakeConnector implements McpConnector {
  failStdio = false;
  last?: ReturnType<typeof connection>;
  stdioCalls: Array<{ command: string; args: string[] }> = [];
  async connectStdio(command: string, args: string[]): Promise<McpConnection> {
    this.stdioCalls.push({ command, args });
    if (this.failStdio || command === 'missing') throw new Error('command not found');
    this.last = connection(command);
    return this.last;
  }
  async connectHttp(): Promise<McpConnection> {
    this.last = connection('http');
    return this.last;
  }
}

const createManager = async (connector = new FakeConnector(), bundledNpxCliPath?: string) => {
  const file = path.join(dir, 'mcp.json');
  await saveMcpConfig(file, {
    mcpServers: {
      filesystem: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        enabled: true,
        timeout: 10_000,
        flattenNames: true,
        toolFilter: {
          include: ['read_file', 'write_file', 'read'],
          inputParams: { read_file: ['path'] },
          requiredParams: { read_file: ['path'] },
        },
        toolPermissions: {
          read_file: { kind: 'read', resourceParam: 'path' },
          write_file: { kind: 'write', resourceParam: 'path' },
        },
      },
      broken: {
        type: 'stdio',
        command: 'missing',
        args: [],
        enabled: true,
        timeout: 10_000,
        flattenNames: false,
        toolFilter: { include: ['read_file'] },
        toolPermissions: {},
      },
    },
  });
  const manager = new McpClientManager(
    new ConfigService(
      validateEnvironment({
        NODE_ENV: 'test',
        MCP_CONFIG_PATH: file,
        MCP_NPX_CLI_PATH: bundledNpxCliPath,
      }),
    ),
    connector,
  );
  await manager.bootstrap();
  return manager;
};

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mcp-manager-'));
  closed = [];
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('McpClientManager', () => {
  it('sidecar 使用内置 Node 启动随包分发的 npx CLI', async () => {
    const connector = new FakeConnector();
    await createManager(connector, '/bundle/node_modules/npm/bin/npx-cli.js');
    expect(connector.stdioCalls[0]).toEqual({
      command: process.execPath,
      args: [
        '/bundle/node_modules/npm/bin/npx-cli.js',
        '-y',
        '@modelcontextprotocol/server-filesystem',
        '/tmp',
      ],
    });
  });

  it('单个失败的 server 不影响其他连接，且未勾选工具不会暴露', async () => {
    const manager = await createManager();
    const servers = manager.listServers();
    expect(servers.find((item) => item.name === 'filesystem')?.status).toBe('connected');
    expect(servers.find((item) => item.name === 'broken')?.status).toBe('error');
    const names = manager.listModelTools('edit').map((tool) => tool.name);
    expect(names).toContain('read_file');
    expect(names).toContain('filesystem__read');
    expect(names).not.toContain('read');
    expect(manager.get('read_file')?.model.inputSchema).toEqual({
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    });
    expect(() => manager.get('read_file')?.parse({ path: 'a.md', extra: true })).toThrow();
    expect(
      manager
        .listServerTools('filesystem')
        .every((tool) => tool.name !== 'list_directory' || !tool.selected),
    ).toBe(true);
  });

  it('与内置工具重名时强制加前缀，写工具在只读模式被隐藏', async () => {
    const manager = await createManager();
    expect(manager.listModelTools('edit').map((tool) => tool.name)).toContain('filesystem__read');
    expect(manager.listModelTools('read-only').every((tool) => tool.name !== 'write_file')).toBe(
      true,
    );
    expect(manager.get('write_file')?.permission).toBe('write');
    const write = manager.get('write_file');
    if (!write) throw new Error('missing write_file');
    const ctx = { workspaceRoot: dir, signal: new AbortController().signal };
    expect(write.parse({ path: 'out.md' })).toEqual({ path: 'out.md' });
    const prepared = await write.prepare({ path: 'out.md' }, ctx);
    await expect(write.execute({ path: 'out.md' }, ctx, prepared)).resolves.toBe('ok');
    await expect(manager.reconnect('missing')).rejects.toThrow('不存在');
  });

  it('手动重连能恢复，关闭时释放连接', async () => {
    const connector = new FakeConnector();
    connector.failStdio = true;
    const manager = await createManager(connector);
    expect(manager.listServers().find((item) => item.name === 'filesystem')?.status).toBe('error');
    connector.failStdio = false;
    await expect(manager.reconnect('filesystem')).resolves.toEqual(
      expect.objectContaining({ status: 'connected' }),
    );
    await manager.patch('filesystem', { enabled: false });
    expect(manager.listServers().find((item) => item.name === 'filesystem')?.enabled).toBe(false);
    await manager.onModuleDestroy();
    expect(closed.length).toBeGreaterThan(0);
  });

  it('HTTP server 可连接，关闭后不再建立新连接', async () => {
    const file = path.join(dir, 'http.json');
    await saveMcpConfig(file, {
      mcpServers: {
        remote: {
          type: 'http',
          url: 'https://example.test/mcp',
          enabled: true,
          timeout: 10_000,
          flattenNames: false,
          toolFilter: { include: ['read_file'] },
          toolPermissions: {},
        },
      },
    });
    const manager = new McpClientManager(
      new ConfigService(validateEnvironment({ NODE_ENV: 'test', MCP_CONFIG_PATH: file })),
      new FakeConnector(),
    );
    await manager.onModuleInit();
    await vi.waitFor(() => {
      expect(manager.listServers()[0]?.status).toBe('connected');
    });
    expect(manager.listModelTools('edit').map((tool) => tool.name)).toContain('remote__read_file');
    await manager.patch('remote', { flattenNames: true, toolFilter: { include: ['read_file'] } });
    expect(manager.listServerTools('remote')[0]?.exposedName).toBe('read_file');
    await manager.onModuleDestroy();
    await expect(manager.reconnect('remote')).resolves.toEqual(
      expect.objectContaining({ status: 'disconnected' }),
    );
  });

  it('连接过程中关闭会丢掉刚建立的连接', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    class DelayedConnector extends FakeConnector {
      waiting = false;
      override async connectStdio(): Promise<McpConnection> {
        this.waiting = true;
        await gate;
        return connection('late');
      }
    }
    const delayed = new DelayedConnector();
    const file = path.join(dir, 'slow.json');
    await saveMcpConfig(file, {
      mcpServers: {
        filesystem: {
          type: 'stdio',
          command: 'npx',
          args: [],
          enabled: true,
          timeout: 10_000,
          flattenNames: false,
          toolFilter: { include: ['read_file'] },
          toolPermissions: {},
        },
      },
    });
    const manager = new McpClientManager(
      new ConfigService(validateEnvironment({ NODE_ENV: 'test', MCP_CONFIG_PATH: file })),
      delayed,
    );
    const boot = manager.bootstrap();
    await vi.waitFor(() => {
      expect(delayed.waiting).toBe(true);
    });
    await manager.onModuleDestroy();
    release();
    await boot;
    expect(closed).toContain('late');
  });

  it('子进程退出后标记 error 且不再暴露工具', async () => {
    const connector = new FakeConnector();
    const manager = await createManager(connector);
    expect(manager.listServers().find((item) => item.name === 'filesystem')?.status).toBe(
      'connected',
    );
    connector.last?.triggerExit();
    expect(manager.listServers().find((item) => item.name === 'filesystem')).toEqual(
      expect.objectContaining({ status: 'error', error: 'MCP 进程已退出' }),
    );
    expect(manager.listModelTools('edit')).toEqual([]);
  });

  it('调用 MCP 工具时注入固定参数', async () => {
    const file = path.join(dir, 'weather.json');
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    class WeatherConnector extends FakeConnector {
      override async connectStdio(): Promise<McpConnection> {
        return {
          listTools: async () => [
            {
              name: 'get_weather_summary',
              description: '天气',
              inputSchema: {
                type: 'object',
                properties: {
                  city_name: { type: 'string' },
                  units: { type: 'string' },
                },
              },
            },
          ],
          callTool: async (name, args) => {
            calls.push({ name, args });
            return { content: [{ type: 'text', text: '22C' }] };
          },
          close: async () => undefined,
          onClosed: () => undefined,
        };
      }
    }
    await saveMcpConfig(file, {
      mcpServers: {
        weather: {
          type: 'stdio',
          command: 'npx',
          args: [],
          enabled: true,
          timeout: 10_000,
          flattenNames: true,
          toolFilter: {
            include: ['get_weather_summary'],
            inputParams: { get_weather_summary: ['city_name'] },
            requiredParams: { get_weather_summary: ['city_name'] },
            fixedParams: { get_weather_summary: { units: 'metric' } },
          },
          toolPermissions: { get_weather_summary: { kind: 'execute' } },
        },
      },
    });
    const manager = new McpClientManager(
      new ConfigService(validateEnvironment({ NODE_ENV: 'test', MCP_CONFIG_PATH: file })),
      new WeatherConnector(),
    );
    await manager.bootstrap();
    const tool = manager.get('get_weather_summary');
    if (!tool) throw new Error('missing weather tool');
    const ctx = { workspaceRoot: dir, signal: new AbortController().signal };
    await expect(tool.execute({ city_name: 'Beijing' }, ctx)).resolves.toBe('22C');
    expect(calls).toEqual([
      { name: 'get_weather_summary', args: { city_name: 'Beijing', units: 'metric' } },
    ]);
    expect(tool.model.inputSchema).toEqual({
      type: 'object',
      properties: { city_name: { type: 'string' } },
      required: ['city_name'],
      additionalProperties: false,
    });
    await manager.onModuleDestroy();
  });
});
