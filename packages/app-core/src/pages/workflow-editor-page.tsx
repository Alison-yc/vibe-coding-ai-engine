import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { usePlatform } from '@ai-engine/platform';
import { Badge, Button, Input } from '@ai-engine/ui';
import { StartNodeConfigSchema } from '@ai-engine/contracts';
import { WorkflowCanvas } from '../workflow/canvas/workflow-canvas';
import { WorkflowConfigPanel } from '../workflow/canvas/config-panel';
import { RunInputDialog } from '../workflow/canvas/run-input-dialog';
import { WorkflowRunLogPanel } from '../workflow/canvas/run-log-panel';
import { NodeMetadataMap } from '../workflow/nodes/metadata';
import { flushConfigDrafts } from '../workflow/nodes/use-config-draft';
import {
  getWorkflowRun,
  getWorkflow,
  listWorkflowRuns,
  stopWorkflowRun,
  streamWorkflow,
  updateWorkflow,
  validateWorkflow,
} from '../workflow/workflow-api';
import {
  loadWorkflowGraph,
  serializeWorkflowGraph,
  useWorkflowStore,
} from '../workflow/store/workflow-store';

export const WorkflowEditorPage = () => {
  const { id = '' } = useParams();
  const platform = usePlatform();
  const queryClient = useQueryClient();
  const hydratedId = useRef('');
  const hydratedRunId = useRef('');
  const streamController = useRef<AbortController | null>(null);
  const activeRun = useRef(0);
  const runGuard = useRef(false);
  const [name, setName] = useState('');
  const [nameDirty, setNameDirty] = useState(false);
  const [starting, setStarting] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(true);
  const startNode = useWorkflowStore((state) =>
    state.nodes.find((node) => node.data.type === 'start'),
  );
  const dirty = useWorkflowStore((state) => state.dirty);
  const running = useWorkflowStore((state) => state.running);
  const runId = useWorkflowStore((state) => state.runId);
  const workflowStatus = useWorkflowStore((state) => state.workflowStatus);
  const applyRuntimeEvent = useWorkflowStore((state) => state.applyRuntimeEvent);
  const markSaved = useWorkflowStore((state) => state.markSaved);
  const workflow = useQuery({
    queryKey: ['workflow', id],
    queryFn: () => getWorkflow(platform, id),
    enabled: Boolean(id),
  });
  const runs = useQuery({
    queryKey: ['workflow-runs', id],
    queryFn: () => listWorkflowRuns(platform, id),
    enabled: Boolean(workflow.data),
  });
  const latestRun = useQuery({
    queryKey: ['workflow-run', runs.data?.[0]?.id],
    queryFn: () => getWorkflowRun(platform, runs.data?.[0]?.id ?? ''),
    enabled: Boolean(runs.data?.[0]?.id),
  });
  useEffect(() => {
    if (!workflow.data || hydratedId.current === workflow.data.id) return;
    hydratedId.current = workflow.data.id;
    setName(workflow.data.name);
    setNameDirty(false);
    loadWorkflowGraph(workflow.data.graph);
  }, [workflow.data]);
  useEffect(() => {
    const detail = latestRun.data;
    if (!detail || hydratedRunId.current === detail.run.id || runGuard.current) return;
    hydratedRunId.current = detail.run.id;
    useWorkflowStore.setState((state) => ({
      running: detail.run.status === 'running',
      runId: detail.run.status === 'running' ? detail.run.id : null,
      workflowStatus: detail.run.status,
      logs: [
        ...detail.nodeRuns.map((nodeRun) => ({
          id: nodeRun.id,
          nodeId: nodeRun.nodeId,
          status: nodeRun.status,
          title:
            state.nodes.find((node) => node.id === nodeRun.nodeId)?.data.title ??
            `节点 ${nodeRun.nodeId}`,
          inputs: nodeRun.inputs,
          outputs: nodeRun.outputs ?? undefined,
          elapsedMs: nodeRun.elapsedMs,
          error: nodeRun.error ?? undefined,
          text: '',
        })),
        {
          id: `workflow:${detail.run.id}`,
          status: detail.run.status,
          title: detail.run.status === 'stopped' ? '工作流已停止' : '最近一次运行',
          outputs: detail.run.outputs ?? undefined,
          error: detail.run.error ?? undefined,
          text: '',
        },
      ],
    }));
  }, [latestRun.data]);
  useEffect(
    () => () => {
      activeRun.current += 1;
      runGuard.current = false;
      streamController.current?.abort();
      streamController.current = null;
    },
    [id],
  );

  const save = useMutation({
    mutationFn: async ({ validate }: { validate: boolean }) => {
      flushConfigDrafts();
      const state = useWorkflowStore.getState();
      const graph = serializeWorkflowGraph(state.nodes, state.edges, state.viewport);
      if (validate) {
        const localErrors = state.nodes.flatMap((node) =>
          NodeMetadataMap[node.data.type]
            .checkValid(node.data.config)
            .map((message) => ({ message, nodeIds: [node.id] })),
        );
        const server = await validateWorkflow(platform, id, graph);
        const errors = [...localErrors, ...server.errors];
        useWorkflowStore.setState((state) => ({
          nodes: state.nodes.map((node) => ({
            ...node,
            data: {
              ...node.data,
              _validationErrors: errors
                .filter((error) => error.nodeIds.includes(node.id))
                .map((error) => error.message),
            },
          })),
        }));
        if (errors.length > 0) throw new Error(errors.map((error) => error.message).join('；'));
      }
      return updateWorkflow(platform, id, { name: name.trim(), graph });
    },
    onSuccess: async () => {
      markSaved();
      setNameDirty(false);
      await queryClient.invalidateQueries({ queryKey: ['workflow', id] });
      await queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });

  useEffect(() => {
    if ((!dirty && !nameDirty) || running || starting || !id || !name.trim()) return;
    const timer = globalThis.setTimeout(() => save.mutate({ validate: false }), 1200);
    return () => globalThis.clearTimeout(timer);
  }, [dirty, id, name, nameDirty, running, save, starting]);

  const startRun = async (inputs: Record<string, unknown>) => {
    if (runGuard.current) return;
    runGuard.current = true;
    setStarting(true);
    setRunDialogOpen(false);
    const session = activeRun.current + 1;
    activeRun.current = session;
    try {
      await save.mutateAsync({ validate: true });
      if (activeRun.current !== session) return;
      const controller = new AbortController();
      streamController.current = controller;
      await streamWorkflow(platform, id, { inputs }, controller.signal, (event) => {
        if (activeRun.current === session) applyRuntimeEvent(event);
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        useWorkflowStore.setState({
          running: false,
          workflowStatus: 'failed',
          logs: [
            ...useWorkflowStore.getState().logs,
            {
              id: `client:${Date.now()}`,
              status: 'failed',
              title: '运行失败',
              error: error instanceof Error ? error.message : '运行失败',
              text: '',
            },
          ],
        });
      }
    } finally {
      if (activeRun.current === session) {
        streamController.current = null;
        const finishedRunId = useWorkflowStore.getState().runId;
        if (finishedRunId) hydratedRunId.current = finishedRunId;
        void queryClient.invalidateQueries({ queryKey: ['workflow-runs', id] });
      }
      runGuard.current = false;
      setStarting(false);
    }
  };

  const stopRun = async () => {
    if (!runId) return;
    const accepted = await stopWorkflowRun(platform, runId).catch((error: unknown) => {
      useWorkflowStore.setState((state) => ({
        logs: [
          ...state.logs,
          {
            id: `stop-error:${Date.now()}`,
            status: 'failed',
            title: '停止失败',
            error: error instanceof Error ? error.message : '停止工作流失败',
            text: '',
          },
        ],
      }));
      return false;
    });
    if (!accepted) return;
    activeRun.current += 1;
    streamController.current?.abort();
    streamController.current = null;
    useWorkflowStore.setState((state) => ({
      running: false,
      runId: null,
      workflowStatus: 'stopped',
      nodes: state.nodes.map((node) => ({
        ...node,
        data: { ...node.data, _runningStatus: 'idle' },
      })),
      logs: [
        ...state.logs,
        {
          id: `stopped:${Date.now()}`,
          status: 'stopped',
          title: '工作流已停止',
          text: '',
        },
      ],
    }));
  };

  const startConfig = StartNodeConfigSchema.safeParse(startNode?.data.config);

  if (workflow.isPending) return <main className="p-6">正在加载工作流…</main>;
  if (workflow.error)
    return (
      <main className="text-destructive p-6">
        {workflow.error instanceof Error ? workflow.error.message : '工作流加载失败'}
      </main>
    );

  return (
    <main className="bg-background text-foreground relative flex h-dvh min-h-0 flex-col overflow-hidden">
      <header className="border-border flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Button size="sm" variant="ghost" asChild>
          <Link to="/workflow">← 工作流</Link>
        </Button>
        <Input
          aria-label="工作流名称"
          className="max-w-72"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setNameDirty(true);
          }}
        />
        <Badge variant="secondary">
          {save.isPending ? '保存中' : dirty || nameDirty ? '未保存' : '已保存'}
        </Badge>
        <Badge variant={workflowStatus === 'failed' ? 'destructive' : 'outline'}>
          {workflowStatus}
        </Badge>
        {save.error ? (
          <span className="text-destructive min-w-0 flex-1 truncate text-xs">
            {save.error instanceof Error ? save.error.message : '保存失败'}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={save.isPending || running || starting}
          onClick={() => save.mutate({ validate: true })}
        >
          保存并校验
        </Button>
        {running ? (
          <Button size="sm" variant="destructive" onClick={() => void stopRun()}>
            停止
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={!startConfig.success || starting}
            onClick={() => setRunDialogOpen(true)}
          >
            {starting ? '准备中…' : '运行'}
          </Button>
        )}
      </header>
      <div className="flex min-h-0 flex-1">
        <WorkflowCanvas />
        <WorkflowConfigPanel
          workflowId={id}
          beforeDebugRun={() => save.mutateAsync({ validate: true }).then(() => undefined)}
        />
      </div>
      <WorkflowRunLogPanel open={logsOpen} onToggle={() => setLogsOpen((open) => !open)} />
      {runDialogOpen && startConfig.success ? (
        <RunInputDialog
          fields={startConfig.data.fields}
          onClose={() => setRunDialogOpen(false)}
          onRun={(inputs) => void startRun(inputs)}
        />
      ) : null}
    </main>
  );
};
