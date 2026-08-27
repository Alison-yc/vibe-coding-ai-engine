import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AgentMode,
  type AgentModelTool,
  type McpRemoteTool,
  type McpServerConfig,
  type McpServerPatchRequest,
  type McpServerStatus,
  type PermissionKind,
} from '@ai-engine/contracts';
import type { AppConfig } from '../config/ollama.config';
import type { RegisteredTool } from '../agent/tools/tool';
import { loadMcpConfig, saveMcpConfig } from './mcp-config';
import {
  MCP_CONNECTOR,
  type McpConnection,
  type McpConnector,
  type McpRemoteToolDefinition,
} from './mcp-connector';
import {
  BUILTIN_TOOL_NAMES,
  filterMcpToolNames,
  mcpExposedName,
  projectMcpToolInputSchema,
} from './merge-tools';
import type { McpToolCatalog } from './mcp-tool-catalog';
import { McpToolAdapter } from './mcp-tool.adapter';

type ServerRuntime = {
  name: string;
  config: McpServerConfig;
  status: 'connected' | 'disconnected' | 'error';
  error?: string;
  connection?: McpConnection;
  remoteTools: McpRemoteToolDefinition[];
  ignoreClose: boolean;
};

const wrapAdapter = (adapter: McpToolAdapter): RegisteredTool => ({
  model: {
    name: adapter.name,
    description: adapter.description,
    inputSchema: { type: 'object' },
  },
  permission: adapter.permission,
  parse: (input) => adapter.input.parse(input),
  prepare: (input, context) => adapter.prepare(adapter.input.parse(input), context),
  execute: async (input, context, prepared) =>
    adapter.toModelOutput(await adapter.execute(adapter.input.parse(input), context, prepared)),
});

@Injectable()
export class McpClientManager implements OnModuleInit, OnModuleDestroy, McpToolCatalog {
  private readonly runtimes = new Map<string, ServerRuntime>();
  private adapters = new Map<string, RegisteredTool>();
  private shuttingDown = false;
  private readonly logger = new Logger(McpClientManager.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<AppConfig, true>,
    @Inject(MCP_CONNECTOR) private readonly connector: McpConnector,
  ) {}

  onModuleInit(): void {
    void this.bootstrap();
  }

  async bootstrap(): Promise<void> {
    await this.reloadFromDisk();
    await this.connectEnabled();
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    await Promise.all([...this.runtimes.values()].map((runtime) => this.disconnect(runtime.name)));
  }

  listServers(): McpServerStatus[] {
    return [...this.runtimes.values()].map((runtime) => ({
      name: runtime.name,
      type: runtime.config.type,
      enabled: runtime.config.enabled,
      status: runtime.status,
      error: runtime.error,
      toolCount: runtime.remoteTools.length,
      selectedToolCount: this.selectedOriginalNames(runtime).length,
    }));
  }

  listServerTools(name: string): McpRemoteTool[] {
    const runtime = this.requireRuntime(name);
    const selected = new Set(this.selectedOriginalNames(runtime));
    const used = this.usedNames();
    const flatten = this.canFlatten() && runtime.config.flattenNames;
    return runtime.remoteTools.map((tool) => {
      const permission = runtime.config.toolPermissions[tool.name];
      return {
        name: tool.name,
        description: tool.description,
        exposedName: mcpExposedName(runtime.name, tool.name, flatten, used),
        selected: selected.has(tool.name),
        permissionKind: permission?.kind ?? 'execute',
      };
    });
  }

  listModelTools(mode: AgentMode): AgentModelTool[] {
    const tools: AgentModelTool[] = [];
    for (const [name, adapter] of this.adapters) {
      if (mode === 'read-only' && adapter.permission !== 'read') continue;
      tools.push({ ...adapter.model, name });
    }
    return tools;
  }

  get(name: string): RegisteredTool | null {
    return this.adapters.get(name) ?? null;
  }

  async reconnect(name: string): Promise<McpServerStatus> {
    const runtime = this.requireRuntime(name);
    await this.disconnect(name);
    if (runtime.config.enabled) await this.connect(name);
    const status = this.listServers().find((item) => item.name === name);
    if (!status) throw new Error(`MCP server 不存在：${name}`);
    return status;
  }

  async patch(name: string, patch: McpServerPatchRequest): Promise<McpServerStatus> {
    const runtime = this.requireRuntime(name);
    runtime.config = {
      ...runtime.config,
      ...('enabled' in patch && patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...('flattenNames' in patch && patch.flattenNames !== undefined
        ? { flattenNames: patch.flattenNames }
        : {}),
      ...('toolFilter' in patch
        ? {
            toolFilter: patch.toolFilter
              ? { ...runtime.config.toolFilter, ...patch.toolFilter }
              : undefined,
          }
        : {}),
    };
    await this.persist();
    if (runtime.config.enabled) {
      if (runtime.status !== 'connected') await this.connect(name);
      else this.rebuildAdapters();
    } else {
      await this.disconnect(name);
    }
    const status = this.listServers().find((item) => item.name === name);
    if (!status) throw new Error(`MCP server 不存在：${name}`);
    return status;
  }

  private configPath(): string {
    return this.config.get('MCP_CONFIG_PATH', { infer: true });
  }

  private async reloadFromDisk(): Promise<void> {
    const file = await loadMcpConfig(this.configPath());
    this.runtimes.clear();
    for (const [name, config] of Object.entries(file.mcpServers)) {
      this.runtimes.set(name, {
        name,
        config,
        status: 'disconnected',
        remoteTools: [],
        ignoreClose: true,
      });
    }
  }

  private async persist(): Promise<void> {
    await saveMcpConfig(this.configPath(), {
      mcpServers: Object.fromEntries(
        [...this.runtimes.values()].map((runtime) => [runtime.name, runtime.config]),
      ),
    });
  }

  private async connectEnabled(): Promise<void> {
    for (const runtime of this.runtimes.values()) {
      if (runtime.config.enabled) await this.connect(runtime.name);
    }
  }

  private async connect(name: string): Promise<void> {
    if (this.shuttingDown) return;
    const runtime = this.requireRuntime(name);
    try {
      const connection =
        runtime.config.type === 'stdio'
          ? await this.connector.connectStdio(runtime.config.command, runtime.config.args)
          : await this.connector.connectHttp(runtime.config.url);
      if (this.shuttingDown) {
        await connection.close();
        return;
      }
      if (runtime.config.type === 'stdio') {
        this.logger.log(
          `MCP stdio 已连接 ${name} command=${runtime.config.command} args=${runtime.config.args.join(' ')}`,
        );
      } else {
        this.logger.log(`MCP HTTP 已连接 ${name} url=${runtime.config.url}`);
      }
      runtime.connection = connection;
      runtime.remoteTools = await connection.listTools();
      runtime.status = 'connected';
      runtime.error = undefined;
      runtime.ignoreClose = false;
      connection.onClosed(() => {
        if (this.shuttingDown) return;
        const current = this.runtimes.get(name);
        if (!current || current.ignoreClose || current.connection !== connection) return;
        current.status = 'error';
        current.error = 'MCP 进程已退出';
        current.connection = undefined;
        current.remoteTools = [];
        this.logger.warn(`MCP 进程已退出，已标记断开：${name}`);
        this.rebuildAdapters();
      });
      this.rebuildAdapters();
    } catch (error) {
      runtime.status = 'error';
      runtime.error = error instanceof Error ? error.message : 'MCP 连接失败';
      runtime.connection = undefined;
      runtime.remoteTools = [];
      this.logger.warn(`MCP 连接失败，已跳过 ${name}: ${runtime.error}`);
      this.rebuildAdapters();
    }
  }

  private async disconnect(name: string): Promise<void> {
    const runtime = this.runtimes.get(name);
    if (!runtime) return;
    const connection = runtime.connection;
    runtime.ignoreClose = true;
    runtime.connection = undefined;
    runtime.status = 'disconnected';
    runtime.error = undefined;
    if (connection) await connection.close().catch(() => undefined);
    this.rebuildAdapters();
  }

  private rebuildAdapters(): void {
    const next = new Map<string, RegisteredTool>();
    const used = this.usedNames();
    const flatten = this.canFlatten();
    for (const runtime of this.runtimes.values()) {
      if (!runtime.config.enabled || runtime.status !== 'connected' || !runtime.connection)
        continue;
      const selected = this.selectedOriginalNames(runtime);
      const connection = runtime.connection;
      for (const tool of runtime.remoteTools) {
        if (!selected.includes(tool.name)) continue;
        const exposed = mcpExposedName(
          runtime.name,
          tool.name,
          flatten && runtime.config.flattenNames,
          used,
        );
        used.add(exposed);
        const permission = runtime.config.toolPermissions[tool.name];
        const kind: PermissionKind = permission?.kind ?? 'execute';
        const inputSchema = projectMcpToolInputSchema(
          tool.inputSchema,
          runtime.config.toolFilter?.inputParams?.[tool.name],
          runtime.config.toolFilter?.requiredParams?.[tool.name],
        );
        const adapter = new McpToolAdapter(
          exposed,
          tool.description,
          kind,
          tool.name,
          permission?.resourceParam,
          inputSchema,
          (original, args, signal) => {
            const timed = AbortSignal.timeout(runtime.config.timeout);
            const combined = AbortSignal.any([signal, timed]);
            return connection.callTool(original, args, combined);
          },
        );
        const registered = wrapAdapter(adapter);
        registered.model.inputSchema = inputSchema;
        next.set(exposed, registered);
      }
    }
    this.adapters = next;
  }

  private selectedOriginalNames(runtime: ServerRuntime): string[] {
    return filterMcpToolNames(
      runtime.remoteTools.map((tool) => tool.name),
      runtime.config.toolFilter?.include,
    );
  }

  private canFlatten(): boolean {
    return (
      [...this.runtimes.values()].filter(
        (item) => item.config.enabled && item.status === 'connected',
      ).length === 1
    );
  }

  private usedNames(): Set<string> {
    return new Set(BUILTIN_TOOL_NAMES);
  }

  private requireRuntime(name: string): ServerRuntime {
    const runtime = this.runtimes.get(name);
    if (!runtime) throw new Error(`MCP server 不存在：${name}`);
    return runtime;
  }
}
