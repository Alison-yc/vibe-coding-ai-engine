import type {
  AgentMode,
  ChatModelCatalogItem,
  ChatMessage,
  ChatSession,
  Dataset,
  PermissionDecision,
} from '@ai-engine/contracts';
import { Button, Input, Label, Select, Separator, Textarea, ThemeToggle, cn } from '@ai-engine/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type KeyboardEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { usePlatform } from '@ai-engine/platform';
import {
  createChatSession,
  deleteChatSession,
  listChatMessages,
  listChatModels,
  listChatSessions,
  respondChatPermission,
  updateChatSession,
} from '../chat/chat-api';
import {
  hasActiveToolParts,
  shouldHydrateMessages,
  useChatStreamStore,
} from '../chat/chat-stream-store';
import { MessageParts, StreamMarkdown } from '../chat/message-parts';
import { useChatStream } from '../chat/use-chat-stream';
import { useStickToBottom } from '../chat/use-stick-to-bottom';
import { useChatTranslation } from '../i18n/use-chat-translation';
import { listDatasets } from '../knowledge/knowledge-api';
import { useTheme } from '../theme-provider';

export const ChatPage = () => {
  const { t } = useChatTranslation();
  const platform = usePlatform();
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { preference, setPreference } = useTheme();
  const [input, setInput] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [fileAccessState, setFileAccessState] = useState<{
    sessionId: string | undefined;
    enabled: boolean;
  }>({ sessionId, enabled: false });
  const fileAccess = fileAccessState.sessionId === sessionId && fileAccessState.enabled;
  const setFileAccess = (enabled: boolean) => setFileAccessState({ sessionId, enabled });
  const [workspaceRoot, setWorkspaceRoot] = useState('');
  const [mode, setMode] = useState<AgentMode>('edit');
  const storedSessionId = useChatStreamStore((state) => state.sessionId);
  const storedStreaming = useChatStreamStore((state) => state.streaming);
  const storedError = useChatStreamStore((state) => state.error);
  const storedWarning = useChatStreamStore((state) => state.warning);
  const storedApproval = useChatStreamStore((state) => state.approval);
  const storedMessages = useChatStreamStore((state) => state.messages);
  const isCurrentStore = storedSessionId === sessionId;
  const streaming = isCurrentStore && storedStreaming;
  const error = isCurrentStore ? storedError : null;
  const warning = isCurrentStore ? storedWarning : null;
  const approval = storedApproval?.sessionId === sessionId ? storedApproval : null;
  const messages = isCurrentStore ? storedMessages : [];
  const { send, stop } = useChatStream(platform, sessionId);
  const { containerRef, bottomRef, onScroll, stickNow } = useStickToBottom(messages);

  const sessionsQuery = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: () => listChatSessions(platform),
  });
  const messagesQuery = useQuery({
    queryKey: ['chat-messages', sessionId],
    queryFn: () => listChatMessages(platform, sessionId ?? ''),
    enabled: Boolean(sessionId),
    refetchInterval: (query) => (hasActiveToolParts(query.state.data ?? []) ? 1_000 : false),
  });
  const datasetsQuery = useQuery({
    queryKey: ['knowledge-datasets'],
    queryFn: () => listDatasets(platform),
  });
  const modelsQuery = useQuery({
    queryKey: ['chat-models'],
    queryFn: () => listChatModels(platform),
  });
  const busy =
    streaming ||
    Boolean(approval) ||
    hasActiveToolParts(messages) ||
    hasActiveToolParts(messagesQuery.data ?? []);

  const chatSessions = sessionsQuery.data ?? [];
  const session = chatSessions.find((item) => item.id === sessionId);
  const datasetId = session?.datasetIds[0] ?? '';
  const selectedModel = (modelsQuery.data ?? []).find((model) => model.id === session?.modelId);
  const supportsTools = selectedModel?.capability?.supportsTools === true;

  useEffect(() => {
    if (!sessionId || streaming || !messagesQuery.data) return;
    const local = useChatStreamStore.getState();
    if (!shouldHydrateMessages(sessionId, local, messagesQuery.data)) return;
    useChatStreamStore.getState().hydrate(sessionId, messagesQuery.data);
  }, [sessionId, messagesQuery.data, streaming]);

  useEffect(() => {
    stickNow();
  }, [sessionId, stickNow]);

  useEffect(() => {
    void platform.kv.get('agent.workspaceRoot').then((value) => {
      if (value) setWorkspaceRoot(value);
    });
  }, [platform]);

  const createMutation = useMutation({
    mutationFn: () => createChatSession(platform, {}),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      void navigate(`/chat/${created.id}`);
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      updateChatSession(platform, id, { title }),
    onSuccess: async () => {
      setRenameId(null);
      await queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteChatSession(platform, id),
    onSuccess: async (_, id) => {
      setPendingDeleteId(null);
      await queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      if (id === sessionId) void navigate('/chat');
    },
  });

  const modelMutation = useMutation({
    mutationFn: (modelId: string) => {
      if (!sessionId) throw new Error(t('errors.selectSession'));
      return updateChatSession(platform, sessionId, { modelId });
    },
    onSuccess: async (updated) => {
      const model = (modelsQuery.data ?? []).find((item) => item.id === updated.modelId);
      if (!model?.capability?.supportsTools) setFileAccess(false);
      await queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
    },
  });

  const permissionMutation = useMutation({
    mutationFn: (decision: PermissionDecision) => {
      if (!sessionId || !approval) throw new Error(t('errors.approvalExpired'));
      return respondChatPermission(platform, sessionId, approval.id, decision);
    },
    onSuccess: async () => {
      useChatStreamStore.getState().clearApproval(approval?.id);
      await queryClient.invalidateQueries({ queryKey: ['chat-messages', sessionId] });
    },
  });

  const mountKnowledge = async (nextDatasetId: string) => {
    if (!sessionId) return;
    await updateChatSession(platform, sessionId, {
      datasetIds: nextDatasetId ? [nextDatasetId] : [],
    });
    await queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!busy) {
        void onSend();
      }
    }
  };

  const onSend = async () => {
    if (busy) return;
    if (fileAccess && !workspaceRoot.trim()) return;
    const datasetIds = datasetId ? [datasetId] : undefined;
    const content = input;
    setInput('');
    stickNow();
    if (fileAccess) await platform.kv.set('agent.workspaceRoot', workspaceRoot.trim());
    await send(content, {
      datasetIds,
      fileAccess,
      mode,
      ...(fileAccess ? { workspaceRoot: workspaceRoot.trim() } : {}),
    });
  };

  const chooseWorkspace = async () => {
    const selected = await platform.pickDirectory();
    if (!selected) return;
    setWorkspaceRoot(selected);
    await platform.kv.set('agent.workspaceRoot', selected);
  };

  const persistentSidebar = platform.capabilities.persistentChatSidebar === true;
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const localizedStreamError = (() => {
    if (error === '生成失败') return t('errors.generationFailed');
    const httpError = error?.match(/^无法开始生成：HTTP (\d+)$/);
    return httpError ? t('errors.generationHttp', { status: httpError[1] }) : error;
  })();

  const sidebarProps = {
    preference,
    setPreference,
    createPending: createMutation.isPending,
    onCreate: () => createMutation.mutate(),
    sessions: chatSessions,
    currentId: sessionId,
    renameId,
    renameValue,
    pendingDeleteId,
    sessionsError: sessionsQuery.isError,
    onRenameValue: setRenameValue,
    onStartRename: (item: ChatSession) => {
      setRenameId(item.id);
      setRenameValue(item.title);
    },
    onConfirmRename: () => {
      if (renameId && renameValue.trim()) {
        renameMutation.mutate({ id: renameId, title: renameValue.trim() });
      }
    },
    onCancelRename: () => setRenameId(null),
    onAskDelete: setPendingDeleteId,
    onConfirmDelete: (id: string) => deleteMutation.mutate(id),
    onCancelDelete: () => setPendingDeleteId(null),
    onNavigate: () => setMobileSidebarOpen(false),
  };

  return (
    <div className="bg-background text-foreground flex h-dvh overflow-hidden">
      <aside
        className={cn(
          'border-border bg-muted/20 w-64 shrink-0 flex-col border-r',
          persistentSidebar ? 'flex' : 'hidden lg:flex',
        )}
      >
        <ChatSidebarPanel {...sidebarProps} />
      </aside>

      {!persistentSidebar && mobileSidebarOpen ? (
        <>
          <button
            type="button"
            aria-label={t('mobile.closeSidebar')}
            className="bg-background/60 fixed inset-0 z-40 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="border-border bg-muted/20 fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r shadow-xl lg:hidden">
            <ChatSidebarPanel {...sidebarProps} />
          </aside>
        </>
      ) : null}

      <section className="flex min-w-0 flex-1 flex-col">
        {!persistentSidebar ? (
          <div className="border-border bg-muted/30 flex min-w-0 items-center gap-2 border-b px-4 py-2 lg:hidden">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="max-w-28 min-w-0"
              onClick={() => setMobileSidebarOpen(true)}
            >
              <span className="truncate">{t('mobile.openSidebar')}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              className="max-w-28 min-w-0"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              <span className="truncate">{t('sidebar.new')}</span>
            </Button>
            <div className="ml-auto flex min-w-0 flex-1 flex-wrap justify-end gap-1">
              <Button variant="ghost" size="sm" className="min-w-0" asChild>
                <Link to="/knowledge">
                  <span className="truncate">{t('common:nav.knowledge')}</span>
                </Link>
              </Button>
              <Button variant="ghost" size="sm" className="min-w-0" asChild>
                <Link to="/workflow">
                  <span className="truncate">{t('common:nav.workflow')}</span>
                </Link>
              </Button>
              <Button variant="ghost" size="sm" className="min-w-0" asChild>
                <Link to="/settings">
                  <span className="truncate">{t('common:nav.settings')}</span>
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
        <header className="border-border bg-background/95 flex min-h-16 flex-wrap items-end gap-4 border-b px-4 py-3 md:px-6">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {session?.title ?? t('header.noSession')}
            </p>
            {session ? (
              <p className="text-muted-foreground truncate text-xs">{session.modelId}</p>
            ) : null}
          </div>
          <div className="flex max-w-64 min-w-0 flex-1 flex-col gap-1.5 sm:min-w-[12rem]">
            <Label htmlFor="chat-model" className="truncate">
              {t('model.label')}
            </Label>
            <Select
              id="chat-model"
              value={session?.modelId ?? ''}
              disabled={!sessionId || busy || modelMutation.isPending || modelsQuery.isPending}
              onChange={(event) => modelMutation.mutate(event.target.value)}
            >
              {(modelsQuery.data ?? []).map((model: ChatModelCatalogItem) => (
                <option key={model.id} value={model.id} disabled={!model.installed}>
                  {model.kind === 'untested' && !model.installed
                    ? t('model.chatOnlyNotInstalledOption', { modelId: model.id })
                    : model.kind === 'untested'
                      ? t('model.chatOnlyOption', { modelId: model.id })
                      : !model.installed
                        ? t('model.notInstalledOption', { modelId: model.id })
                        : model.id}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex max-w-80 min-w-0 flex-1 flex-col gap-1.5 sm:min-w-[16rem]">
            <Label htmlFor="chat-dataset" className="truncate">
              {t('knowledge.label')}
            </Label>
            <Select
              id="chat-dataset"
              value={datasetId}
              disabled={!sessionId || busy}
              onChange={(event) => {
                void mountKnowledge(event.target.value);
              }}
            >
              <option value="">{t('knowledge.none')}</option>
              {(datasetsQuery.data ?? []).map((dataset: Dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.name}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex min-h-10 min-w-0 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fileAccess}
              disabled={!sessionId || busy || !supportsTools}
              onChange={(event) => setFileAccess(event.target.checked)}
            />
            <span className="truncate">{t('fileAccess.label')}</span>
          </label>
          {session && selectedModel?.kind === 'untested' ? (
            <p className="text-muted-foreground line-clamp-2 w-full text-xs">
              {t('model.untestedNotice')}
            </p>
          ) : null}
          {fileAccess ? (
            <>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-48">
                <Label htmlFor="chat-workspace" className="truncate">
                  {t('fileAccess.workspaceLabel')}
                </Label>
                <Input
                  id="chat-workspace"
                  value={workspaceRoot}
                  disabled={busy}
                  placeholder={t('fileAccess.workspacePlaceholder')}
                  onChange={(event) => setWorkspaceRoot(event.target.value)}
                />
              </div>
              {platform.capabilities.nativeDirectoryPicker ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void chooseWorkspace()}
                >
                  <span className="truncate">{t('fileAccess.chooseDirectory')}</span>
                </Button>
              ) : null}
              <div className="flex max-w-48 min-w-0 flex-1 flex-col gap-1.5">
                <Label htmlFor="chat-file-mode" className="truncate">
                  {t('fileAccess.modeLabel')}
                </Label>
                <Select
                  id="chat-file-mode"
                  value={mode}
                  disabled={busy}
                  onChange={(event) => setMode(event.target.value as AgentMode)}
                >
                  <option value="edit">{t('fileAccess.mode.edit')}</option>
                  <option value="read-only">{t('fileAccess.mode.readOnly')}</option>
                </Select>
              </div>
            </>
          ) : null}
        </header>

        {modelMutation.isError ? (
          <p className="text-destructive bg-destructive/10 line-clamp-2 px-4 py-2 text-sm md:px-6">
            {t('errors.modelSwitch', { message: modelMutation.error.message })}
          </p>
        ) : null}
        {fileAccess && datasetId ? (
          <p className="bg-muted text-muted-foreground line-clamp-2 px-4 py-2 text-sm md:px-6">
            {t('knowledge.skippedForFileAccess')}
          </p>
        ) : null}

        <div
          ref={containerRef}
          className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-8 md:px-8"
          onScroll={onScroll}
        >
          {!sessionId ? (
            <div className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-sm">
              <span className="line-clamp-2">
                {persistentSidebar ? t('empty.persistent') : t('empty.mobile')}
              </span>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-sm">
              <span className="line-clamp-2">{t('empty.messages')}</span>
            </div>
          ) : (
            <ol className="flex w-full min-w-0 flex-col gap-8">
              {messages.map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))}
            </ol>
          )}
          <div ref={bottomRef} aria-hidden className="h-px w-full shrink-0" />
        </div>

        {localizedStreamError ? (
          <p className="text-destructive bg-destructive/10 mx-4 mb-2 line-clamp-2 rounded-md px-3 py-2 text-sm break-words">
            {localizedStreamError}
          </p>
        ) : null}
        {warning ? (
          <p className="text-muted-foreground bg-muted mx-4 mb-2 line-clamp-2 rounded-md px-3 py-2 text-sm break-words">
            {warning}
          </p>
        ) : null}

        <form
          className="border-border bg-background flex min-w-0 shrink-0 flex-col gap-3 border-t px-4 py-4 md:px-8"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void onSend();
          }}
        >
          <Textarea
            value={input}
            disabled={!sessionId || busy}
            className="bg-card min-h-20 resize-none rounded-xl px-4 py-3 shadow-sm"
            placeholder={sessionId ? t('composer.placeholder') : t('composer.noSessionPlaceholder')}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="flex justify-end gap-2">
            {streaming ? (
              <Button type="button" variant="outline" onClick={stop}>
                {t('composer.stop')}
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={
                  !sessionId ||
                  busy ||
                  input.trim().length === 0 ||
                  (fileAccess && workspaceRoot.trim().length === 0)
                }
              >
                {t('composer.send')}
              </Button>
            )}
          </div>
        </form>
      </section>
      {approval ? (
        <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4">
          <section className="border-border bg-card max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl border p-5 shadow-xl">
            <h2 className="line-clamp-2 text-lg font-semibold">{t('approval.title')}</h2>
            <p className="text-muted-foreground mt-1 truncate text-sm">
              {t('approval.summary', { tool: approval.tool, resource: approval.resource })}
            </p>
            <pre className="bg-muted mt-4 max-h-96 overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap">
              {approval.diff || t('approval.noWrite')}
            </pre>
            {permissionMutation.error ? (
              <p className="text-destructive mt-3 line-clamp-2 text-sm break-words">
                {permissionMutation.error.message}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                variant="destructive"
                disabled={permissionMutation.isPending}
                onClick={() => permissionMutation.mutate('deny')}
              >
                {t('approval.deny')}
              </Button>
              <Button
                variant="outline"
                disabled={permissionMutation.isPending}
                onClick={() => permissionMutation.mutate('allow-once')}
              >
                {t('approval.allowOnce')}
              </Button>
              <Button
                disabled={permissionMutation.isPending}
                onClick={() => permissionMutation.mutate('allow-session')}
              >
                {t('approval.allowSession')}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
};

type ChatSidebarPanelProps = {
  preference: ReturnType<typeof useTheme>['preference'];
  setPreference: ReturnType<typeof useTheme>['setPreference'];
  createPending: boolean;
  onCreate: () => void;
  sessions: ChatSession[];
  currentId?: string;
  renameId: string | null;
  renameValue: string;
  pendingDeleteId: string | null;
  sessionsError: boolean;
  onRenameValue: (value: string) => void;
  onStartRename: (session: ChatSession) => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  onAskDelete: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onNavigate?: () => void;
};

export const ChatSidebarPanel = ({
  preference,
  setPreference,
  createPending,
  onCreate,
  sessions,
  currentId,
  renameId,
  renameValue,
  pendingDeleteId,
  sessionsError,
  onRenameValue,
  onStartRename,
  onConfirmRename,
  onCancelRename,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
  onNavigate,
}: ChatSidebarPanelProps) => {
  const { t } = useChatTranslation();
  const themeLabels = {
    appearance: t('theme.appearance'),
    palette: t('theme.palette'),
    modes: {
      light: t('theme.mode.light'),
      dark: t('theme.mode.dark'),
      system: t('theme.mode.system'),
    },
    palettes: {
      neutral: t('theme.paletteName.neutral'),
      blue: t('theme.paletteName.blue'),
      green: t('theme.paletteName.green'),
      purple: t('theme.paletteName.purple'),
    },
  };
  return (
    <>
      <header className="border-border flex min-w-0 items-center justify-between gap-2 border-b px-4 py-3">
        <h1 className="truncate text-lg font-semibold">{t('sidebar.title')}</h1>
        <Button type="button" size="sm" disabled={createPending} onClick={onCreate}>
          <span className="truncate">{t('sidebar.new')}</span>
        </Button>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-3">
        <SessionList
          sessions={sessions}
          currentId={currentId}
          renameId={renameId}
          renameValue={renameValue}
          pendingDeleteId={pendingDeleteId}
          onRenameValue={onRenameValue}
          onStartRename={onStartRename}
          onConfirmRename={onConfirmRename}
          onCancelRename={onCancelRename}
          onAskDelete={onAskDelete}
          onConfirmDelete={onConfirmDelete}
          onCancelDelete={onCancelDelete}
          onNavigate={onNavigate}
        />
        {sessionsError ? (
          <p className="text-destructive line-clamp-2 text-sm">{t('sidebar.loadError')}</p>
        ) : null}
      </div>
      <div className="border-border flex min-w-0 flex-col gap-3 border-t p-4">
        <div className="flex min-w-0 flex-wrap gap-1">
          <Button variant="ghost" size="sm" className="min-w-0 flex-1" asChild>
            <Link to="/knowledge" onClick={onNavigate}>
              <span className="truncate">{t('common:nav.knowledge')}</span>
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="min-w-0 flex-1" asChild>
            <Link to="/workflow" onClick={onNavigate}>
              <span className="truncate">{t('common:nav.workflow')}</span>
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="min-w-0 flex-1" asChild>
            <Link to="/settings" onClick={onNavigate}>
              <span className="truncate">{t('common:nav.settings')}</span>
            </Link>
          </Button>
        </div>
        <ThemeToggle
          preference={preference}
          onPreferenceChange={setPreference}
          labels={themeLabels}
        />
      </div>
    </>
  );
};

export const ChatBubble = ({ message }: { message: ChatMessage }) => {
  const { t } = useChatTranslation();
  const isUser = message.role === 'user';
  const liveText = useChatStreamStore((state) => {
    const current = state.messages.find((item) => item.id === message.id) ?? message;
    const part = current.parts.find((item) => item.type === 'text');
    return part?.type === 'text' ? part.text : '';
  });
  const parts = useChatStreamStore(
    (state) => state.messages.find((item) => item.id === message.id)?.parts ?? message.parts,
  );
  const nonTextParts = parts.filter((part) => part.type !== 'text');

  return (
    <li
      className={cn('flex min-w-0 flex-col gap-1.5', isUser ? 'items-end' : 'w-full items-start')}
    >
      <p className="text-muted-foreground px-1 text-xs">
        {isUser ? t('message.role.user') : t('message.role.assistant')}
      </p>
      <div
        className={cn(
          'min-w-0',
          isUser
            ? 'bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm'
            : 'w-full max-w-full px-1 py-1',
        )}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{liveText}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {parts.some((part) => part.type === 'text') ? <StreamMarkdown text={liveText} /> : null}
            {nonTextParts.length > 0 ? <MessageParts parts={nonTextParts} /> : null}
          </div>
        )}
      </div>
      {message.status === 'interrupted' ? (
        <p className="text-muted-foreground px-1 text-xs">{t('message.interrupted')}</p>
      ) : null}
    </li>
  );
};

export const SessionList = ({
  sessions,
  currentId,
  renameId,
  renameValue,
  pendingDeleteId,
  onRenameValue,
  onStartRename,
  onConfirmRename,
  onCancelRename,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
  basePath = '/chat',
  onNavigate,
}: {
  sessions: ChatSession[];
  currentId?: string;
  renameId: string | null;
  renameValue: string;
  pendingDeleteId: string | null;
  onRenameValue: (value: string) => void;
  onStartRename: (session: ChatSession) => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  onAskDelete: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  basePath?: string;
  onNavigate?: () => void;
}) => {
  const { t } = useChatTranslation();
  if (sessions.length === 0) {
    return (
      <p className="text-muted-foreground border-border rounded-lg border border-dashed p-4 text-center text-sm">
        {t('sidebar.empty')}
      </p>
    );
  }
  return (
    <ul className="flex flex-1 flex-col gap-2 overflow-y-auto">
      {sessions.map((item) => (
        <li
          key={item.id}
          className={cn(
            'border-border rounded-lg border p-2 shadow-sm transition-colors',
            item.id === currentId ? 'bg-accent border-accent-foreground/10' : 'bg-card',
          )}
        >
          {renameId === item.id ? (
            <div className="flex flex-col gap-2">
              <Input value={renameValue} onChange={(event) => onRenameValue(event.target.value)} />
              <div className="flex gap-1">
                <Button type="button" size="sm" onClick={onConfirmRename}>
                  <span className="truncate">{t('session.save')}</span>
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={onCancelRename}>
                  <span className="truncate">{t('session.cancel')}</span>
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Link
                to={`${basePath}/${item.id}`}
                className={cn('block truncate text-sm', item.id === currentId && 'font-semibold')}
                onClick={onNavigate}
              >
                {item.title}
              </Link>
              <Separator className="my-2" />
              <div className="flex flex-wrap gap-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => onStartRename(item)}>
                  <span className="truncate">{t('session.rename')}</span>
                </Button>
                {pendingDeleteId === item.id ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => onConfirmDelete(item.id)}
                    >
                      <span className="truncate">{t('session.confirmDelete')}</span>
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={onCancelDelete}>
                      <span className="truncate">{t('session.cancel')}</span>
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onAskDelete(item.id)}
                  >
                    <span className="truncate">{t('session.delete')}</span>
                  </Button>
                )}
              </div>
            </>
          )}
        </li>
      ))}
    </ul>
  );
};
