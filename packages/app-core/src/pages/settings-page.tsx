import type { McpRemoteTool, McpServerStatus } from '@ai-engine/contracts';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Label } from '@ai-engine/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePlatform } from '@ai-engine/platform';
import { AppNavLinks, EmptyState, PageShell } from '../components/page-shell';
import {
  listExposedAgentTools,
  listMcpServerTools,
  listMcpServers,
  patchMcpServer,
  reconnectMcpServer,
} from '../mcp/mcp-api';

const statusLabel: Record<McpServerStatus['status'], string> = {
  connected: '已连接',
  disconnected: '未连接',
  error: '连接失败',
};

const ServerCard = ({ server }: { server: McpServerStatus }) => {
  const platform = usePlatform();
  const queryClient = useQueryClient();
  const tools = useQuery({
    queryKey: ['mcp-tools', server.name],
    queryFn: () => listMcpServerTools(platform, server.name),
  });
  const reconnect = useMutation({
    mutationFn: () => reconnectMcpServer(platform, server.name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
      await queryClient.invalidateQueries({ queryKey: ['mcp-tools', server.name] });
      await queryClient.invalidateQueries({ queryKey: ['agent-tools'] });
    },
  });
  const patch = useMutation({
    mutationFn: (next: { enabled?: boolean; include?: string[] }) =>
      patchMcpServer(platform, server.name, {
        ...(next.enabled !== undefined ? { enabled: next.enabled } : {}),
        ...(next.include ? { toolFilter: { include: next.include } } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
      await queryClient.invalidateQueries({ queryKey: ['mcp-tools', server.name] });
      await queryClient.invalidateQueries({ queryKey: ['agent-tools'] });
    },
  });

  const toggleTool = (tool: McpRemoteTool, selected: boolean) => {
    const current = (tools.data ?? []).filter((item) => item.selected).map((item) => item.name);
    const include = selected
      ? [...new Set([...current, tool.name])]
      : current.filter((name) => name !== tool.name);
    patch.mutate({ include });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{server.name}</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            {server.type} · 已选 {server.selectedToolCount}/{server.toolCount}
          </p>
        </div>
        <Badge variant={server.status === 'connected' ? 'secondary' : 'outline'}>
          {statusLabel[server.status]}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {server.error ? <p className="text-destructive text-sm">{server.error}</p> : null}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={server.enabled}
            disabled={patch.isPending}
            onChange={(event) => patch.mutate({ enabled: event.target.checked })}
          />
          启用
        </label>
        <div className="flex flex-col gap-2">
          <Label>可供模型使用的工具</Label>
          {(tools.data ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              连接后可勾选工具。未勾选的不会发给模型。
            </p>
          ) : (
            (tools.data ?? []).map((tool) => (
              <label key={tool.name} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  aria-label={tool.name}
                  checked={tool.selected}
                  disabled={patch.isPending || !server.enabled}
                  onChange={(event) => toggleTool(tool, event.target.checked)}
                />
                <span>
                  <span className="font-medium">{tool.name}</span>
                  <span className="text-muted-foreground"> → {tool.exposedName}</span>
                  <span className="text-muted-foreground block">{tool.description}</span>
                </span>
              </label>
            ))
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={reconnect.isPending}
          onClick={() => reconnect.mutate()}
        >
          重新连接
        </Button>
      </CardContent>
    </Card>
  );
};

export const SettingsPage = () => {
  const platform = usePlatform();
  const servers = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: () => listMcpServers(platform),
  });
  const exposed = useQuery({
    queryKey: ['agent-tools'],
    queryFn: () => listExposedAgentTools(platform),
  });

  return (
    <PageShell
      title="设置"
      description="管理 MCP server。command 只能写在服务端配置文件里，页面只能开关与勾选工具。"
      nav={<AppNavLinks />}
    >
      {servers.error || exposed.error ? (
        <p className="text-destructive text-sm">
          {(servers.error ?? exposed.error)?.message ?? '加载失败'}
        </p>
      ) : null}
      {(servers.data ?? []).length === 0 ? (
        <EmptyState
          title="还没有配置 MCP server"
          description="复制 mcp.json.example 为 mcp.json，填写可信的 stdio/HTTP server 后重启后端。"
        />
      ) : (
        <section className="flex flex-col gap-4">
          {(servers.data ?? []).map((server) => (
            <ServerCard key={server.name} server={server} />
          ))}
        </section>
      )}
      <Card>
        <CardHeader>
          <CardTitle>当前暴露给模型的工具</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="text-muted-foreground mb-2">
            上限 {exposed.data?.maxToolCount ?? 6}（依据 .plan/04 的 qwen3.5:2b 基线）。
          </p>
          <ul className="flex flex-col gap-1">
            {(exposed.data?.tools ?? []).map((tool) => (
              <li key={tool.name}>
                {tool.name}
                <span className="text-muted-foreground"> · {tool.source}</span>
              </li>
            ))}
          </ul>
          {(exposed.data?.dropped ?? []).length > 0 ? (
            <p className="text-muted-foreground mt-2">已裁剪：{exposed.data?.dropped.join('、')}</p>
          ) : null}
        </CardContent>
      </Card>
    </PageShell>
  );
};
