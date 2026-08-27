import type { ChatMessage, ChatSession, Dataset } from '@ai-engine/contracts';
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
  updateChatSession,
} from '../chat/chat-api';
import { useChatStreamStore, shouldHydrateMessages } from '../chat/chat-stream-store';
import { MessageParts, StreamMarkdown } from '../chat/message-parts';
import { useChatStream } from '../chat/use-chat-stream';
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
  const streaming = useChatStreamStore((state) => state.streaming);
  const error = useChatStreamStore((state) => state.error);
  const messages = useChatStreamStore((state) => state.messages);
  const { send, stop } = useChatStream(platform, sessionId);

  const sessionsQuery = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: () => listChatSessions(platform),
  });
  const messagesQuery = useQuery({
    queryKey: ['chat-messages', sessionId],
    queryFn: () => listChatMessages(platform, sessionId ?? ''),
    enabled: Boolean(sessionId),
  });
  const datasetsQuery = useQuery({
    queryKey: ['knowledge-datasets'],
    queryFn: () => listDatasets(platform),
  });

  const session = sessionsQuery.data?.find((item) => item.id === sessionId);
  const datasetId = session?.datasetIds[0] ?? '';

  useEffect(() => {
    if (!sessionId || streaming || !messagesQuery.data) return;
    const local = useChatStreamStore.getState();
    if (!shouldHydrateMessages(sessionId, local)) return;
    useChatStreamStore.getState().hydrate(sessionId, messagesQuery.data);
  }, [sessionId, messagesQuery.data, streaming]);

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
      if (!streaming) {
        void onSend();
      }
    }
  };

  const onSend = async () => {
    const datasetIds = datasetId ? [datasetId] : undefined;
    const content = input;
    setInput('');
    await send(content, datasetIds);
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
            sessions={sessionsQuery.data ?? []}
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
              <Link to="/settings">设置</Link>
            </Button>
          </div>
          <ThemeToggle preference={preference} onPreferenceChange={setPreference} />
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-background/95 flex min-h-16 flex-wrap items-center gap-4 border-b px-4 py-3 md:px-6">
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
              disabled={!sessionId}
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
        </header>

        <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-8 md:px-8">
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
        </div>

        {error ? (
          <p className="text-destructive bg-destructive/10 mx-4 mb-2 rounded-md px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}

        <form
          className="border-border bg-background flex min-w-0 shrink-0 flex-col gap-3 border-t px-4 py-4 md:px-8"
          onSubmit={(event) => {
            event.preventDefault();
            if (!streaming) void onSend();
          }}
        >
          <Textarea
            value={input}
            disabled={!sessionId || streaming}
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
              <Button type="submit" disabled={!sessionId || input.trim().length === 0}>
                发送
              </Button>
            )}
          </div>
        </form>
      </section>
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
                to={`/chat/${item.id}`}
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
