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
  localizeBackendConnectionError,
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
import { useFeatureTranslation } from '../i18n/feature-resources';
import { localizeApiError } from '../i18n/localize-api-error';

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
  const { t } = useFeatureTranslation('settings');
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
    <Card className="w-full min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="line-clamp-2">{t('backend.cardTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-3">
        <Label htmlFor="settings-backend-address">{t('backend.addressLabel')}</Label>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <Input
            id="settings-backend-address"
            value={address}
            disabled={save.isPending}
            placeholder="http://localhost:3000"
            onChange={(event) => setAddress(event.target.value)}
          />
          <Button
            type="button"
            className="min-w-0"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <span className="truncate">
              {save.isPending ? t('backend.testing') : t('backend.saveAndTest')}
            </span>
          </Button>
        </div>
        <p className="text-muted-foreground line-clamp-3 text-xs">
          {t('backend.localOnlyDescription')}
        </p>
        {save.isSuccess ? <p className="line-clamp-2 text-sm">{t('backend.success')}</p> : null}
        {save.error ? (
          <p className="text-destructive text-sm">
            {localizeBackendConnectionError(save.error, t)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};

const ServerCard = ({ server }: { server: McpServerStatus }) => {
  const platform = usePlatform();
  const queryClient = useQueryClient();
  const { t } = useFeatureTranslation('settings');
  const { t: errorT } = useFeatureTranslation('errors');
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
  const requestError = tools.error ?? reconnect.error ?? patch.error;

  return (
    <Card className="w-full min-w-0 overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="truncate">{server.name}</CardTitle>
          <p className="text-muted-foreground mt-1 truncate text-sm">
            {server.type} ·{' '}
            {t('mcp.selectedCount', {
              selected: server.selectedToolCount,
              total: server.toolCount,
            })}
          </p>
        </div>
        <Badge
          className="max-w-40 min-w-0 shrink-0 truncate"
          variant={server.status === 'connected' ? 'secondary' : 'outline'}
        >
          {t(`mcp.status.${server.status}`)}
        </Badge>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        {server.error ? <p className="text-destructive text-sm">{server.error}</p> : null}
        {requestError ? (
          <p className="text-destructive text-sm">
            {localizeApiError(requestError, errorT, t('mcp.loadError'))}
          </p>
        ) : null}
        <p className="text-muted-foreground line-clamp-3 text-sm">
          {server.type === 'stdio' ? t('mcp.stdioWarning') : t('mcp.httpWarning')}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={server.enabled}
            disabled={patch.isPending}
            onChange={(event) => patch.mutate({ enabled: event.target.checked })}
          />
          {t('mcp.enabled')}
        </label>
        <div className="flex min-w-0 flex-col gap-2">
          <Label>{t('mcp.remoteTools')}</Label>
          {(tools.data ?? []).length === 0 ? (
            <p className="text-muted-foreground line-clamp-3 text-sm">{t('mcp.toolsEmpty')}</p>
          ) : (
            (tools.data ?? []).map((tool) => (
              <label key={tool.name} className="flex min-w-0 items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  aria-label={tool.name}
                  checked={tool.selected}
                  disabled={patch.isPending || !server.enabled}
                  onChange={(event) => toggleTool(tool, event.target.checked)}
                />
                <span className="min-w-0">
                  <span className="block truncate">
                    <span className="font-medium">{tool.name}</span>
                    <span className="text-muted-foreground"> → {tool.exposedName}</span>
                  </span>
                  <span className="text-muted-foreground line-clamp-2">{tool.description}</span>
                </span>
              </label>
            ))
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-w-0"
          disabled={reconnect.isPending}
          onClick={() => reconnect.mutate()}
        >
          <span className="truncate">{t('mcp.reconnect')}</span>
        </Button>
      </CardContent>
    </Card>
  );
};

export const SettingsPage = () => {
  const platform = usePlatform();
  const { t: commonT } = useTranslation();
  const { t } = useFeatureTranslation('settings');
  const { t: errorT } = useFeatureTranslation('errors');
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
      title={commonT('settings.title')}
      description={commonT('settings.description')}
      nav={<AppNavLinks />}
    >
      <LanguageCard />
      {platform.capabilities.backendConnectionSetup ? <BackendAddressCard /> : null}
      {servers.error || exposed.error ? (
        <p className="text-destructive text-sm">
          {localizeApiError(servers.error ?? exposed.error, errorT, t('mcp.loadError'))}
        </p>
      ) : null}
      {(servers.data ?? []).length === 0 ? (
        <EmptyState title={t('mcp.emptyTitle')} description={t('mcp.emptyDescription')} />
      ) : (
        <section className="flex min-w-0 flex-col gap-4">
          {(servers.data ?? []).map((server) => (
            <ServerCard key={server.name} server={server} />
          ))}
        </section>
      )}
      <Card className="w-full min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="line-clamp-2">{t('automaticTools.cardTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 text-sm">
          <p className="text-muted-foreground mb-2 line-clamp-3">
            {t('automaticTools.limit', { count: exposed.data?.maxToolCount ?? 6 })}
          </p>
          <p className="text-muted-foreground mb-2 line-clamp-3">
            {t('automaticTools.builtinDescription')}
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
            <p className="text-muted-foreground mt-2 truncate">
              {t('automaticTools.dropped', { names: exposed.data?.dropped.join(', ') })}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </PageShell>
  );
};
