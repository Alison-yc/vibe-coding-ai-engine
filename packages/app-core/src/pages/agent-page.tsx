import type { AgentMode, ChatMessage, PermissionDecision } from '@ai-engine/contracts';
import { usePlatform } from '@ai-engine/platform';
import { Button, Input, Label, Select, Textarea, ThemeToggle, cn } from '@ai-engine/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { respondAgentPermission, streamAgent } from '../agent/agent-api';
import { shouldHydrateAgentMessages, useAgentStore } from '../agent/agent-store';
import { createChatSession, listChatMessages, listChatSessions } from '../chat/chat-api';
import { MessageParts, StreamMarkdown } from '../chat/message-parts';
import { useTheme } from '../theme-provider';

const AgentBubble = ({ message }: { message: ChatMessage }) => {
  const user = message.role === 'user';
  const text = message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
  const otherParts = message.parts.filter((part) => part.type !== 'text');
  return (
    <li className={cn('flex min-w-0 flex-col gap-1.5', user ? 'items-end' : 'items-start')}>
      <span className="text-muted-foreground text-xs">{user ? '我' : '文件助手'}</span>
      <div
        className={cn(
          'min-w-0',
          user
            ? 'bg-primary text-primary-foreground max-w-[85%] rounded-2xl px-4 py-2.5'
            : 'w-full',
        )}
      >
        {user ? (
          <p className="text-sm whitespace-pre-wrap">{text}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {text ? <StreamMarkdown text={text} /> : null}
            {otherParts.length > 0 ? <MessageParts parts={otherParts} /> : null}
          </div>
        )}
      </div>
    </li>
  );
};

export const AgentPage = () => {
  const platform = usePlatform();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { sessionId } = useParams();
  const { preference, setPreference } = useTheme();
  const [content, setContent] = useState('');
  const [workspaceRoot, setWorkspaceRoot] = useState('');
  const [mode, setMode] = useState<AgentMode>('edit');
  const controller = useRef<AbortController | null>(null);
  const streamBaselineDataUpdatedAt = useRef(-1);
  const storeSessionId = useAgentStore((state) => state.sessionId);
  const messages = useAgentStore((state) => state.messages);
  const streaming = useAgentStore((state) => state.streaming);
  const error = useAgentStore((state) => state.error);
  const approval = useAgentStore((state) => state.approval);

  const sessions = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: () => listChatSessions(platform),
  });
  const agentSessions = (sessions.data ?? []).filter((session) => session.agentType === 'agent');
  const currentSession = agentSessions.find((session) => session.id === sessionId);
  const messageQuery = useQuery({
    queryKey: ['chat-messages', sessionId],
    queryFn: () => listChatMessages(platform, sessionId ?? ''),
    enabled: Boolean(currentSession),
    refetchInterval: (query) =>
      query.state.data?.some((message) =>
        message.parts.some(
          (part) => part.type === 'tool' && (part.state === 'pending' || part.state === 'running'),
        ),
      )
        ? 1000
        : false,
  });
  const visibleMessages = storeSessionId === sessionId ? messages : [];
  const activeTool = visibleMessages.some((message) =>
    message.parts.some(
      (part) => part.type === 'tool' && (part.state === 'pending' || part.state === 'running'),
    ),
  );
  const busy = streaming || Boolean(approval) || activeTool;

  useEffect(() => {
    void platform.kv.get('agent.workspaceRoot').then((value) => {
      if (value) setWorkspaceRoot(value);
    });
  }, [platform]);

  useEffect(() => {
    if (!sessionId || streaming || !messageQuery.data) return;
    if (messageQuery.dataUpdatedAt <= streamBaselineDataUpdatedAt.current) return;
    const state = useAgentStore.getState();
    if (shouldHydrateAgentMessages(sessionId, state)) state.hydrate(sessionId, messageQuery.data);
  }, [messageQuery.data, messageQuery.dataUpdatedAt, sessionId, streaming]);

  useEffect(() => {
    const state = useAgentStore.getState();
    if (state.sessionId !== sessionId) state.reset(sessionId);
    streamBaselineDataUpdatedAt.current = -1;
    return () => {
      controller.current?.abort();
      controller.current = null;
      useAgentStore.getState().stop();
    };
  }, [sessionId]);

  const createSession = useMutation({
    mutationFn: () => createChatSession(platform, { title: '新文件任务', agentType: 'agent' }),
    onSuccess: async (session) => {
      await queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      void navigate(`/agent/${session.id}`);
    },
  });

  const permission = useMutation({
    mutationFn: (decision: PermissionDecision) => {
      if (!sessionId || !approval) throw new Error('审批上下文已失效');
      return respondAgentPermission(platform, sessionId, approval.id, decision);
    },
    onSuccess: async () => {
      useAgentStore.getState().clearApproval(approval?.id);
      await queryClient.invalidateQueries({ queryKey: ['chat-messages', sessionId] });
    },
  });

  const chooseWorkspace = async () => {
    const selected = await platform.pickDirectory();
    if (!selected) return;
    setWorkspaceRoot(selected);
    await platform.kv.set('agent.workspaceRoot', selected);
  };

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!currentSession || !content.trim() || !workspaceRoot.trim() || busy) return;
    const activeSessionId = currentSession.id;
    const value = content.trim();
    setContent('');
    await platform.kv.set('agent.workspaceRoot', workspaceRoot.trim());
    streamBaselineDataUpdatedAt.current = messageQuery.dataUpdatedAt;
    useAgentStore.getState().begin(activeSessionId, value);
    const nextController = new AbortController();
    controller.current = nextController;
    try {
      await streamAgent(
        platform,
        activeSessionId,
        { content: value, workspaceRoot: workspaceRoot.trim(), mode },
        nextController.signal,
        (agentEvent) => {
          const state = useAgentStore.getState();
          if (!nextController.signal.aborted && state.sessionId === activeSessionId) {
            state.applyEvent(agentEvent);
          }
        },
      );
    } catch (streamError) {
      if (!nextController.signal.aborted) {
        useAgentStore.getState().applyEvent({
          event: 'error',
          data: {
            message: streamError instanceof Error ? streamError.message : 'Agent 请求失败',
          },
        });
      }
    } finally {
      if (controller.current === nextController) controller.current = null;
      await queryClient.invalidateQueries({ queryKey: ['chat-messages', sessionId] });
      await queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
    }
  };

  return (
    <div className="bg-background text-foreground flex h-dvh overflow-hidden">
      <aside className="border-border bg-muted/20 hidden w-64 shrink-0 flex-col border-r lg:flex">
        <header className="border-border flex items-center justify-between border-b px-4 py-3">
          <h1 className="font-semibold">文件助手</h1>
          <Button
            size="sm"
            disabled={createSession.isPending}
            onClick={() => createSession.mutate()}
          >
            新建
          </Button>
        </header>
        <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
          {agentSessions.map((session) => (
            <Link
              key={session.id}
              to={`/agent/${session.id}`}
              className={cn(
                'border-border bg-card truncate rounded-lg border p-3 text-sm',
                session.id === sessionId && 'bg-accent font-medium',
              )}
            >
              {session.title}
            </Link>
          ))}
        </nav>
        <footer className="border-border flex flex-col gap-3 border-t p-4">
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" asChild>
              <Link to="/chat">对话</Link>
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/workflow">工作流</Link>
            </Button>
          </div>
          <ThemeToggle preference={preference} onPreferenceChange={setPreference} />
        </footer>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-border flex flex-wrap items-end gap-3 border-b p-4">
          <div className="min-w-48 flex-1">
            <Label htmlFor="agent-workspace">工作区目录</Label>
            <Input
              id="agent-workspace"
              value={workspaceRoot}
              placeholder="输入服务端可访问的绝对路径"
              onChange={(event) => setWorkspaceRoot(event.target.value)}
            />
          </div>
          {platform.capabilities.nativeDirectoryPicker ? (
            <Button variant="outline" onClick={() => void chooseWorkspace()}>
              选择目录
            </Button>
          ) : null}
          <div>
            <Label htmlFor="agent-mode">模式</Label>
            <Select
              id="agent-mode"
              value={mode}
              onChange={(event) => setMode(event.target.value as AgentMode)}
            >
              <option value="edit">编辑模式</option>
              <option value="read-only">只读模式</option>
            </Select>
          </div>
        </header>

        <section className="min-w-0 flex-1 overflow-y-auto p-4 md:p-8">
          {!currentSession ? (
            <p className="text-muted-foreground flex h-full items-center justify-center text-sm">
              新建或选择一个文件助手会话。
            </p>
          ) : visibleMessages.length === 0 ? (
            <p className="text-muted-foreground flex h-full items-center justify-center text-sm">
              指定工作区后，可以让助手读取、搜索或修改文件。
            </p>
          ) : (
            <ol className="flex min-w-0 flex-col gap-8">
              {visibleMessages.map((message) => (
                <AgentBubble key={message.id} message={message} />
              ))}
            </ol>
          )}
        </section>

        {error ? <p className="text-destructive mx-4 text-sm">{error}</p> : null}
        <form
          className="border-border flex flex-col gap-3 border-t p-4"
          onSubmit={(event) => void send(event)}
        >
          <Textarea
            aria-label="文件助手消息"
            value={content}
            disabled={!currentSession || busy}
            placeholder="例如：读取 README.md 并总结"
            onChange={(event) => setContent(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            {streaming ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  controller.current?.abort();
                  useAgentStore.getState().stop();
                }}
              >
                停止
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={!currentSession || busy || !content.trim() || !workspaceRoot.trim()}
              >
                发送
              </Button>
            )}
          </div>
        </form>
      </main>

      {approval ? (
        <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4">
          <section className="border-border bg-card max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl border p-5 shadow-xl">
            <h2 className="text-lg font-semibold">需要文件操作审批</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              工具 {approval.tool} · {approval.resource}
            </p>
            <pre className="bg-muted mt-4 max-h-96 overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap">
              {approval.diff || '该操作不会写入内容，但目标属于敏感路径。'}
            </pre>
            {permission.error ? (
              <p className="text-destructive mt-3 text-sm">{permission.error.message}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                variant="destructive"
                disabled={permission.isPending}
                onClick={() => permission.mutate('deny')}
              >
                拒绝
              </Button>
              <Button
                variant="outline"
                disabled={permission.isPending}
                onClick={() => permission.mutate('allow-once')}
              >
                允许一次
              </Button>
              <Button
                disabled={permission.isPending}
                onClick={() => permission.mutate('allow-session')}
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
