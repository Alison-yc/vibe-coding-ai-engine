import type {
  AgentMode,
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
import { listDatasets } from '../knowledge/knowledge-api';
import { useTheme } from '../theme-provider';

export const ChatPage = () => {
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
  const busy =
    streaming ||
    Boolean(approval) ||
    hasActiveToolParts(messages) ||
    hasActiveToolParts(messagesQuery.data ?? []);

  const chatSessions = sessionsQuery.data ?? [];
  const session = chatSessions.find((item) => item.id === sessionId);
  const datasetId = session?.datasetIds[0] ?? '';

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

  const permissionMutation = useMutation({
    mutationFn: (decision: PermissionDecision) => {
      if (!sessionId || !approval) throw new Error('审批上下文已失效');
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

  return (
    <div className="bg-background text-foreground flex h-dvh overflow-hidden">
      <aside className="border-border bg-muted/20 hidden w-64 shrink-0 flex-col border-r lg:flex">
        <header className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
          <h1 className="text-lg font-semibold">对话</h1>
          <Button
            type="button"
            size="sm"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            新建
          </Button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <SessionList
            sessions={chatSessions}
            currentId={sessionId}
            renameId={renameId}
            renameValue={renameValue}
            pendingDeleteId={pendingDeleteId}
            onRenameValue={setRenameValue}
            onStartRename={(item) => {
              setRenameId(item.id);
              setRenameValue(item.title);
            }}
            onConfirmRename={() => {
              if (renameId && renameValue.trim()) {
                renameMutation.mutate({ id: renameId, title: renameValue.trim() });
              }
            }}
            onCancelRename={() => setRenameId(null)}
            onAskDelete={setPendingDeleteId}
            onConfirmDelete={(id) => deleteMutation.mutate(id)}
            onCancelDelete={() => setPendingDeleteId(null)}
          />
          {sessionsQuery.isError ? (
            <p className="text-destructive text-sm">无法加载会话列表</p>
          ) : null}
        </div>
        <div className="border-border flex flex-col gap-3 border-t p-4">
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/knowledge">知识库</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/workflow">工作流</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/settings">设置</Link>
            </Button>
          </div>
          <ThemeToggle preference={preference} onPreferenceChange={setPreference} />
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-background/95 flex min-h-16 flex-wrap items-end gap-4 border-b px-4 py-3 md:px-6">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{session?.title ?? '选择或新建会话'}</p>
            {session ? (
              <p className="text-muted-foreground truncate text-xs">{session.modelId}</p>
            ) : null}
          </div>
          <div className="flex min-w-[12rem] flex-col gap-1.5 sm:min-w-[16rem]">
            <Label htmlFor="chat-dataset">知识库挂载</Label>
            <Select
              id="chat-dataset"
              value={datasetId}
              disabled={!sessionId || busy}
              onChange={(event) => {
                void mountKnowledge(event.target.value);
              }}
            >
              <option value="">不挂载</option>
              {(datasetsQuery.data ?? []).map((dataset: Dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.name}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fileAccess}
              disabled={!sessionId || busy}
              onChange={(event) => setFileAccess(event.target.checked)}
            />
            文件访问
          </label>
          {fileAccess ? (
            <>
              <div className="flex min-w-48 flex-1 flex-col gap-1.5">
                <Label htmlFor="chat-workspace">工作区目录</Label>
                <Input
                  id="chat-workspace"
                  value={workspaceRoot}
                  disabled={busy}
                  placeholder="输入服务端可访问的绝对路径"
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
                  选择目录
                </Button>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="chat-file-mode">文件模式</Label>
                <Select
                  id="chat-file-mode"
                  value={mode}
                  disabled={busy}
                  onChange={(event) => setMode(event.target.value as AgentMode)}
                >
                  <option value="edit">编辑</option>
                  <option value="read-only">只读</option>
                </Select>
              </div>
            </>
          ) : null}
        </header>

        {fileAccess && datasetId ? (
          <p className="bg-muted text-muted-foreground px-4 py-2 text-sm md:px-6">
            文件访问已开启：本轮不会检索已挂载的知识库。
          </p>
        ) : null}

        <div
          ref={containerRef}
          className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-8 md:px-8"
          onScroll={onScroll}
        >
          {!sessionId ? (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              从左侧新建或选择一个会话。
            </div>
          ) : messages.length === 0 ? (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              还没有消息，在下方输入开始对话。
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

        {error ? (
          <p className="text-destructive bg-destructive/10 mx-4 mb-2 rounded-md px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
        {warning ? (
          <p className="text-muted-foreground bg-muted mx-4 mb-2 rounded-md px-3 py-2 text-sm">
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
            placeholder={sessionId ? '输入消息，Enter 发送，Shift+Enter 换行' : '请先新建会话'}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="flex justify-end gap-2">
            {streaming ? (
              <Button type="button" variant="outline" onClick={stop}>
                停止生成
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
                发送
              </Button>
            )}
          </div>
        </form>
      </section>
      {approval ? (
        <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4">
          <section className="border-border bg-card max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl border p-5 shadow-xl">
            <h2 className="text-lg font-semibold">需要工具调用审批</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              工具 {approval.tool} · {approval.resource}
            </p>
            <pre className="bg-muted mt-4 max-h-96 overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap">
              {approval.diff || '该调用不会写入内容，但需要你的确认。'}
            </pre>
            {permissionMutation.error ? (
              <p className="text-destructive mt-3 text-sm">{permissionMutation.error.message}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                variant="destructive"
                disabled={permissionMutation.isPending}
                onClick={() => permissionMutation.mutate('deny')}
              >
                拒绝
              </Button>
              <Button
                variant="outline"
                disabled={permissionMutation.isPending}
                onClick={() => permissionMutation.mutate('allow-once')}
              >
                允许一次
              </Button>
              <Button
                disabled={permissionMutation.isPending}
                onClick={() => permissionMutation.mutate('allow-session')}
              >
                本会话始终允许
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
};

export const ChatBubble = ({ message }: { message: ChatMessage }) => {
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
      <p className="text-muted-foreground px-1 text-xs">{isUser ? '我' : '助手'}</p>
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
        <p className="text-muted-foreground px-1 text-xs">已停止</p>
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
}) => {
  if (sessions.length === 0) {
    return (
      <p className="text-muted-foreground border-border rounded-lg border border-dashed p-4 text-center text-sm">
        还没有会话
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
                  保存
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={onCancelRename}>
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Link
                to={`${basePath}/${item.id}`}
                className={cn('block truncate text-sm', item.id === currentId && 'font-semibold')}
              >
                {item.title}
              </Link>
              <Separator className="my-2" />
              <div className="flex flex-wrap gap-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => onStartRename(item)}>
                  重命名
                </Button>
                {pendingDeleteId === item.id ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => onConfirmDelete(item.id)}
                    >
                      确认
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={onCancelDelete}>
                      取消
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onAskDelete(item.id)}
                  >
                    删除
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
