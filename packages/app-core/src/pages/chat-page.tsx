import {
  ErrorCodeSchema,
  type AgentMode,
  type ChatModelCatalogItem,
  type ChatMessage,
  type ChatSession,
  type Dataset,
  type PermissionDecision,
} from '@ai-engine/contracts';
import {
  Button,
  Input,
  Label,
  MessageSquare,
  MoreVertical,
  Select,
  Switch,
  Textarea,
  cn,
} from '@ai-engine/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { MessageParts } from '../chat/message-parts';
import { useChatStream } from '../chat/use-chat-stream';
import { useStickToBottom } from '../chat/use-stick-to-bottom';
import { useChatTranslation } from '../i18n/use-chat-translation';
import { localizeApiError } from '../i18n/localize-api-error';
import { listDatasets } from '../knowledge/knowledge-api';
import { AppNavRail } from '../components/page-shell';

export const ChatPage = () => {
  const { t } = useChatTranslation();
  const { t: errorT } = useTranslation('errors');
  const platform = usePlatform();
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
    if (error === 'chat-error:fallback') return t('errors.generationFailed');
    if (error === 'chat-error:missing-body') return t('errors.streamMissingBody');
    if (error?.startsWith('api-error:')) {
      const code = ErrorCodeSchema.safeParse(error.slice('api-error:'.length));
      if (code.success) return errorT(`api.${code.data}`);
    }
    return error;
  })();

  const sidebarProps = {
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
      <AppNavRail />
      <aside
        className={cn(
          'border-border bg-sidebar w-64 shrink-0 flex-col border-r',
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
          <aside className="border-border bg-sidebar fixed inset-y-0 left-[4.25rem] z-50 flex w-72 max-w-[85vw] flex-col border-r shadow-xl lg:hidden">
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
          </div>
        ) : null}
        <header className="border-border bg-background/95 flex min-w-0 flex-col gap-3 border-b px-4 py-3 md:px-6">
          <div className="grid w-full min-w-0 items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_14rem_18rem]">
            <div className="min-w-0 sm:col-span-2 xl:col-span-1">
              <p className="truncate text-sm font-medium">
                {session?.title ?? t('header.noSession')}
              </p>
              {session ? (
                <p className="text-muted-foreground truncate text-xs">{session.modelId}</p>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="chat-model" className="truncate" title={t('model.label')}>
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
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="chat-dataset" className="truncate" title={t('knowledge.label')}>
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
          </div>
          {session && selectedModel?.kind === 'untested' ? (
            <p className="text-muted-foreground line-clamp-2 w-full text-xs">
              {t('model.untestedNotice')}
            </p>
          ) : null}
        </header>

        {modelMutation.isError ? (
          <p className="text-destructive bg-destructive/10 line-clamp-2 px-4 py-2 text-sm md:px-6">
            {t('errors.modelSwitch', {
              message: localizeApiError(modelMutation.error, errorT),
            })}
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
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
              <span className="bg-primary/10 text-primary grid size-14 place-items-center rounded-2xl">
                <MessageSquare className="size-7" aria-hidden />
              </span>
              <p className="text-muted-foreground line-clamp-2 max-w-sm text-sm">
                {persistentSidebar ? t('empty.persistent') : t('empty.mobile')}
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
              <span className="bg-muted text-muted-foreground grid size-14 place-items-center rounded-2xl">
                <MessageSquare className="size-7" aria-hidden />
              </span>
              <p className="text-muted-foreground line-clamp-2 max-w-sm text-sm">
                {t('empty.messages')}
              </p>
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
          className="border-border bg-background flex min-w-0 shrink-0 flex-col border-t px-4 py-4 md:px-8"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void onSend();
          }}
        >
          <div
            data-testid="chat-composer"
            className="border-border bg-card flex w-full min-w-0 flex-col overflow-hidden rounded-xl border shadow-sm"
          >
            <div className="border-border/70 flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Switch
                  id="chat-file-access"
                  checked={fileAccess}
                  disabled={!sessionId || busy || !supportsTools}
                  onCheckedChange={setFileAccess}
                  aria-label={t('fileAccess.label')}
                />
                <Label htmlFor="chat-file-access" className="truncate text-sm font-normal">
                  {t('fileAccess.label')}
                </Label>
              </div>
            </div>
            {fileAccess ? (
              <div
                data-testid="chat-file-access-toolbar"
                className={cn(
                  'border-border/60 bg-muted/15 motion-safe-fade-in grid w-full min-w-0 items-end gap-2 border-b px-3 py-2.5',
                  platform.capabilities.nativeDirectoryPicker
                    ? 'sm:grid-cols-[minmax(0,1fr)_auto_minmax(10rem,12rem)]'
                    : 'sm:grid-cols-[minmax(0,1fr)_minmax(10rem,12rem)]',
                )}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <Label
                    htmlFor="chat-workspace"
                    className="text-muted-foreground truncate text-xs font-normal"
                    title={t('fileAccess.workspaceLabel')}
                  >
                    {t('fileAccess.workspaceLabel')}
                  </Label>
                  <Input
                    id="chat-workspace"
                    className="bg-background h-9"
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
                    size="sm"
                    className="h-9 w-full shrink-0 sm:w-auto"
                    disabled={busy}
                    onClick={() => void chooseWorkspace()}
                  >
                    <span className="truncate" title={t('fileAccess.chooseDirectory')}>
                      {t('fileAccess.chooseDirectory')}
                    </span>
                  </Button>
                ) : null}
                <div className="flex min-w-0 flex-col gap-1">
                  <Label
                    htmlFor="chat-file-mode"
                    className="text-muted-foreground truncate text-xs font-normal"
                    title={t('fileAccess.modeLabel')}
                  >
                    {t('fileAccess.modeLabel')}
                  </Label>
                  <Select
                    id="chat-file-mode"
                    className="bg-background h-9"
                    value={mode}
                    disabled={busy}
                    onChange={(event) => setMode(event.target.value as AgentMode)}
                  >
                    <option value="edit">{t('fileAccess.mode.edit')}</option>
                    <option value="read-only">{t('fileAccess.mode.readOnly')}</option>
                  </Select>
                </div>
              </div>
            ) : null}
            <Textarea
              value={input}
              disabled={!sessionId || busy}
              className="min-h-20 resize-none rounded-none border-0 bg-transparent px-4 py-3 shadow-none focus-visible:ring-0"
              placeholder={
                sessionId ? t('composer.placeholder') : t('composer.noSessionPlaceholder')
              }
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <div className="border-border/70 flex justify-end gap-2 border-t px-3 py-2">
              {streaming ? (
                <Button type="button" variant="outline" size="sm" onClick={stop}>
                  {t('composer.stop')}
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="sm"
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
                {localizeApiError(permissionMutation.error, errorT)}
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
  return (
    <>
      <header className="border-border flex min-w-0 flex-col gap-3 border-b px-3 py-3">
        <h1 className="truncate px-1 text-base font-semibold">{t('sidebar.title')}</h1>
        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={createPending}
          onClick={onCreate}
        >
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
          onCreate={onCreate}
          createPending={createPending}
          onNavigate={onNavigate}
        />
        {sessionsError ? (
          <p className="text-destructive line-clamp-2 text-sm">{t('sidebar.loadError')}</p>
        ) : null}
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
  const textPart = parts.find((part) => part.type === 'text');
  const userText = textPart?.type === 'text' ? textPart.text : liveText;

  return (
    <li
      className={cn(
        'motion-safe-slide-up flex min-w-0 flex-col gap-1.5',
        isUser ? 'items-end' : 'w-full items-start',
      )}
    >
      <p className="text-muted-foreground px-1 text-xs">
        {isUser ? t('message.role.user') : t('message.role.assistant')}
      </p>
      {isUser ? (
        <div className="bg-primary text-primary-foreground max-w-[85%] min-w-0 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm shadow-sm">
          <p className="whitespace-pre-wrap">{userText}</p>
        </div>
      ) : (
        <div className="border-primary/20 w-full max-w-3xl min-w-0 border-l-2 pl-4">
          <MessageParts parts={parts} />
        </div>
      )}
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
  onCreate,
  createPending,
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
  onCreate?: () => void;
  createPending?: boolean;
  basePath?: string;
  onNavigate?: () => void;
}) => {
  const { t } = useChatTranslation();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenuId) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpenMenuId(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [openMenuId]);

  if (sessions.length === 0) {
    return (
      <div className="border-border flex flex-col items-center gap-3 rounded-lg border border-dashed p-4 text-center">
        <p className="text-muted-foreground text-sm">{t('sidebar.empty')}</p>
        {onCreate ? (
          <Button type="button" size="sm" disabled={createPending} onClick={onCreate}>
            {t('sidebar.new')}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-1">
      {sessions.map((item) => (
        <li
          key={item.id}
          className={cn(
            'group relative rounded-md transition-colors duration-150',
            item.id === currentId ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/60',
          )}
        >
          {renameId === item.id ? (
            <div className="flex flex-col gap-2 p-2">
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
          ) : pendingDeleteId === item.id ? (
            <div className="flex flex-col gap-2 p-2">
              <p className="text-muted-foreground line-clamp-2 text-xs">{item.title}</p>
              <div className="flex flex-wrap gap-1">
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
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-1 py-1.5 pr-1 pl-2">
              <span
                aria-hidden
                className={cn(
                  'bg-primary absolute top-2 bottom-2 left-0 w-0.5 rounded-full transition-opacity',
                  item.id === currentId ? 'opacity-100' : 'opacity-0',
                )}
              />
              <Link
                to={`${basePath}/${item.id}`}
                className={cn(
                  'min-w-0 flex-1 truncate py-0.5 text-sm',
                  item.id === currentId && 'font-semibold',
                )}
                aria-current={item.id === currentId ? 'page' : undefined}
                onClick={onNavigate}
              >
                {item.title}
              </Link>
              <div className="relative shrink-0" ref={openMenuId === item.id ? menuRef : undefined}>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="size-8 shrink-0 p-0 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
                  aria-label={t('session.actions')}
                  aria-expanded={openMenuId === item.id}
                  onClick={() => setOpenMenuId((current) => (current === item.id ? null : item.id))}
                >
                  <MoreVertical className="size-4" aria-hidden />
                </Button>
                {openMenuId === item.id ? (
                  <div className="border-border bg-popover absolute top-full right-0 z-20 mt-1 min-w-32 rounded-md border py-1 shadow-md">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 w-full justify-start rounded-none px-3 text-sm"
                      onClick={() => {
                        setOpenMenuId(null);
                        onStartRename(item);
                      }}
                    >
                      {t('session.rename')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive hover:text-destructive h-8 w-full justify-start rounded-none px-3 text-sm"
                      onClick={() => {
                        setOpenMenuId(null);
                        onAskDelete(item.id);
                      }}
                    >
                      {t('session.delete')}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
};
