import {
  DEFAULT_UI_LOCALE,
  UI_LOCALES,
  UiLocaleSchema,
  type McpRemoteTool,
  type McpServerStatus,
  type UiLocale,
} from '@ai-engine/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
} from '@ai-engine/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '@ai-engine/platform';
import {
  checkBackendConnection,
  normalizeApiBaseUrl,
  persistApiBaseUrl,
} from '../backend-connection';
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

const LANGUAGE_LABELS: Record<UiLocale, string> = {
  'zh-CN': '中文',
  'ja-JP': '日本語',
  'en-US': 'English',
};

const LanguageCard = () => {
  const platform = usePlatform();
  const { t, i18n } = useTranslation();
  const currentLocale = UiLocaleSchema.catch(DEFAULT_UI_LOCALE).parse(i18n.resolvedLanguage);
  const change = useMutation({
    mutationFn: async (locale: UiLocale) => {
      await Promise.all([i18n.changeLanguage(locale), platform.setUiLocale(locale)]);
    },
  });

  return (
    <Card data-testid="language-card" className="w-full min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="line-clamp-2">{t('settings.language.cardTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-3">
        <Label id="settings-ui-locale-label" htmlFor="settings-ui-locale">
          {t('settings.language.label')}
        </Label>
        <Select
          id="settings-ui-locale"
          aria-labelledby="settings-ui-locale-label"
          value={currentLocale}
          disabled={change.isPending}
          className="w-full max-w-sm min-w-0"
          onChange={(event) => change.mutate(UiLocaleSchema.parse(event.target.value))}
        >
          {UI_LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {LANGUAGE_LABELS[locale]}
            </option>
          ))}
        </Select>
        <p className="text-muted-foreground line-clamp-3 text-sm">
          {t('settings.language.description')}
        </p>
        {change.error ? (
          <p className="text-destructive text-sm">{t('settings.language.changeError')}</p>
        ) : null}
      </CardContent>
    </Card>
  );
};

const BackendAddressCard = () => {
  const platform = usePlatform();
  const queryClient = useQueryClient();
  const [address, setAddress] = useState(() => platform.getApiBaseUrl());
  const save = useMutation({
    mutationFn: async () => {
      const normalized = normalizeApiBaseUrl(address);
      await checkBackendConnection(normalized);
      await persistApiBaseUrl(platform, normalized);
      return normalized;
    },
    onSuccess: async (normalized) => {
      setAddress(normalized);
      await queryClient.invalidateQueries();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>后端连接</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Label htmlFor="settings-backend-address">后端地址</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="settings-backend-address"
            value={address}
            disabled={save.isPending}
            placeholder="http://localhost:3000"
            onChange={(event) => setAddress(event.target.value)}
          />
          <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? '正在测试…' : '保存并测试'}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          仅支持本机 localhost 或 127.0.0.1，可修改端口。
        </p>
        {save.isSuccess ? <p className="text-sm">连接成功，地址已保存。</p> : null}
        {save.error ? <p className="text-destructive text-sm">{save.error.message}</p> : null}
      </CardContent>
    </Card>
  );
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
        <p className="text-muted-foreground text-sm">
          {server.type === 'stdio'
            ? '启用后会在服务端启动配置中的第三方进程；仅启用你信任的 MCP。'
            : '启用后服务端会连接外部 MCP 地址；仅启用你信任的服务。'}
        </p>
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
          <Label>远程 MCP 工具</Label>
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
  const { t } = useTranslation();
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
      title={t('settings.title')}
      description={t('settings.description')}
      nav={<AppNavLinks />}
    >
      <LanguageCard />
      {platform.capabilities.backendConnectionSetup ? <BackendAddressCard /> : null}
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
          <CardTitle>当前自动装配的工具</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="text-muted-foreground mb-2">
            上限 {exposed.data?.maxToolCount ?? 6}（依据 .plan/04 的 qwen3.5:2b 基线）。
          </p>
          <p className="text-muted-foreground mb-2">
            datetime、calculate、generate_uuid 属于内置工具，不会出现在上方 MCP 勾选框中。
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
