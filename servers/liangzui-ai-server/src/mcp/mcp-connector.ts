import path from 'node:path';
import process from 'node:process';

export type McpRemoteToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type McpConnection = {
  listTools(): Promise<McpRemoteToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  close(): Promise<void>;
  onClosed(handler: () => void): void;
};

export type McpConnector = {
  connectStdio(command: string, args: string[]): Promise<McpConnection>;
  connectHttp(url: string): Promise<McpConnection>;
};

export const MCP_CONNECTOR = Symbol('MCP_CONNECTOR');

export type McpSdkClient = {
  listTools: () => Promise<{
    tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  }>;
  callTool: (
    input: { name: string; arguments?: Record<string, unknown> },
    resultSchema?: unknown,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>;
  close: () => Promise<void>;
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { type: 'object' };

export const wrapSdkClient = (
  client: McpSdkClient,
  transport?: { onclose?: () => void },
): McpConnection => {
  let closedHandler: (() => void) | undefined;
  if (transport) {
    const prior = transport.onclose;
    transport.onclose = () => {
      prior?.();
      closedHandler?.();
    };
  }
  return {
    listTools: async () => {
      const listed = await client.listTools();
      return listed.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? tool.name,
        inputSchema: toRecord(tool.inputSchema),
      }));
    },
    callTool: async (name, args, signal) => {
      if (signal.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new Error('MCP 调用已取消');
      }
      return client.callTool({ name, arguments: args }, undefined, { signal });
    },
    close: () => client.close(),
    onClosed: (handler) => {
      closedHandler = handler;
    },
  };
};

export class SdkMcpConnector implements McpConnector {
  async connectStdio(command: string, args: string[]): Promise<McpConnection> {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { getDefaultEnvironment, StdioClientTransport } =
      await import('@modelcontextprotocol/sdk/client/stdio.js');
    const env = getDefaultEnvironment();
    env.PATH = [path.dirname(process.execPath), env.PATH].filter(Boolean).join(path.delimiter);
    const transport = new StdioClientTransport({ command, args, env, stderr: 'inherit' });
    const client = new Client({ name: 'ai-engine', version: '0.0.1' });
    await client.connect(transport);
    return wrapSdkClient(
      {
        listTools: () => client.listTools(),
        callTool: (input, _schema, options) => client.callTool(input, undefined, options),
        close: () => client.close(),
      },
      transport,
    );
  }

  async connectHttp(url: string): Promise<McpConnection> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('MCP HTTP 只允许 http/https');
    }
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StreamableHTTPClientTransport } =
      await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
    const transport = new StreamableHTTPClientTransport(parsed);
    const client = new Client({ name: 'ai-engine', version: '0.0.1' });
    await client.connect(transport);
    return wrapSdkClient(
      {
        listTools: () => client.listTools(),
        callTool: (input, _schema, options) => client.callTool(input, undefined, options),
        close: () => client.close(),
      },
      transport,
    );
  }
}
