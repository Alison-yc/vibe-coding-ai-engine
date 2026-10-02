import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SdkMcpConnector, wrapSdkClient } from './mcp-connector';

const sdk = vi.hoisted(() => ({
  connect: vi.fn(async () => undefined),
  listTools: vi.fn(async () => ({
    tools: [{ name: 'ping', inputSchema: ['invalid'] }],
  })),
  callTool: vi.fn(async () => ({ ok: true })),
  close: vi.fn(async () => undefined),
  stdioParameters: undefined as unknown,
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class Client {
    connect = sdk.connect;
    listTools = sdk.listTools;
    callTool = sdk.callTool;
    close = sdk.close;
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  getDefaultEnvironment: () => ({ HOME: '/tmp/home', PATH: '/usr/bin' }),
  StdioClientTransport: class StdioClientTransport {
    constructor(parameters: unknown) {
      sdk.stdioParameters = parameters;
    }
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class StreamableHTTPClientTransport {},
}));

afterEach(() => {
  vi.clearAllMocks();
  sdk.stdioParameters = undefined;
});

describe('SdkMcpConnector', () => {
  it('拒绝非 http(s) 的远程地址', async () => {
    await expect(new SdkMcpConnector().connectHttp('file:///tmp/mcp')).rejects.toThrow(
      'MCP HTTP 只允许 http/https',
    );
  });

  it('stdio 与 http 连接后能列出工具并调用', async () => {
    const stdio = await new SdkMcpConnector().connectStdio('npx', ['-y', 'demo']);
    expect(sdk.stdioParameters).toEqual({
      command: 'npx',
      args: ['-y', 'demo'],
      env: {
        HOME: '/tmp/home',
        PATH: `${path.dirname(process.execPath)}${path.delimiter}/usr/bin`,
      },
      stderr: 'inherit',
    });
    await expect(stdio.listTools()).resolves.toEqual([
      { name: 'ping', description: 'ping', inputSchema: { type: 'object' } },
    ]);
    const http = await new SdkMcpConnector().connectHttp('https://example.test/mcp');
    await expect(http.callTool('ping', { a: 1 }, new AbortController().signal)).resolves.toEqual({
      ok: true,
    });
    await http.close();
    expect(sdk.close).toHaveBeenCalled();
  });
});

describe('wrapSdkClient', () => {
  it('已取消的调用立即失败', async () => {
    const connection = wrapSdkClient({
      listTools: async () => ({ tools: [{ name: 'x', description: 'desc' }] }),
      callTool: async () => ({ ok: true }),
      close: async () => undefined,
    });
    await expect(connection.listTools()).resolves.toEqual([
      { name: 'x', description: 'desc', inputSchema: { type: 'object' } },
    ]);
    const aborted = AbortSignal.abort('stopped');
    await expect(connection.callTool('x', {}, aborted)).rejects.toThrow('MCP 调用已取消');
  });

  it('把 AbortSignal 传给 SDK 第三参', async () => {
    const callTool = vi.fn(async () => ({ ok: true }));
    const signal = new AbortController().signal;
    const connection = wrapSdkClient({
      listTools: async () => ({ tools: [] }),
      callTool,
      close: async () => undefined,
    });
    await connection.callTool('ping', { a: 1 }, signal);
    expect(callTool).toHaveBeenCalledWith({ name: 'ping', arguments: { a: 1 } }, undefined, {
      signal,
    });
  });

  it('把对象形态的 inputSchema 原样带回', async () => {
    const connection = wrapSdkClient({
      listTools: async () => ({
        tools: [
          { name: 'y', inputSchema: { type: 'object', properties: { a: { type: 'string' } } } },
        ],
      }),
      callTool: async () => ({ ok: true }),
      close: async () => undefined,
    });
    await expect(connection.listTools()).resolves.toEqual([
      {
        name: 'y',
        description: 'y',
        inputSchema: { type: 'object', properties: { a: { type: 'string' } } },
      },
    ]);
  });
});
