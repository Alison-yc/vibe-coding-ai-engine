import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { usePlatform } from '@ai-engine/platform';
import { Badge, Button, Input } from '@ai-engine/ui';
import { StartNodeConfigSchema } from '@ai-engine/contracts';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('workflow');
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
            t('editor.nodeFallback', { nodeId: nodeRun.nodeId }),
          inputs: nodeRun.inputs,
          outputs: nodeRun.outputs ?? undefined,
          elapsedMs: nodeRun.elapsedMs,
          error: nodeRun.error ?? undefined,
          text: '',
        })),
        {
          id: `workflow:${detail.run.id}`,
          status: detail.run.status,
          title:
            detail.run.status === 'stopped' ? t('editor.workflowStopped') : t('editor.latestRun'),
          outputs: detail.run.outputs ?? undefined,
          error: detail.run.error ?? undefined,
          text: '',
        },
      ],
    }));
  }, [latestRun.data, t]);
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
              title: t('editor.runFailed'),
              error: error instanceof Error ? error.message : t('editor.runFailed'),
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
            title: t('editor.stopFailed'),
            error: error instanceof Error ? error.message : t('editor.stopWorkflowFailed'),
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
          title: t('editor.workflowStopped'),
          text: '',
        },
      ],
    }));
  };

  const startConfig = StartNodeConfigSchema.safeParse(startNode?.data.config);

  if (workflow.isPending) return <main className="p-6">{t('editor.loading')}</main>;
  if (workflow.error)
    return (
      <main className="text-destructive p-6">
        {workflow.error instanceof Error ? workflow.error.message : t('editor.loadFailed')}
      </main>
    );

  return (
    <main className="bg-background text-foreground relative flex h-dvh min-h-0 flex-col overflow-hidden">
      <header className="border-border flex h-14 min-w-0 shrink-0 items-center gap-3 border-b px-4">
        <Button size="sm" variant="ghost" asChild>
          <Link className="max-w-32 truncate" to="/workflow">
            {t('editor.back')}
          </Link>
        </Button>
        <Input
          aria-label={t('editor.name')}
          className="max-w-72 min-w-0"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setNameDirty(true);
          }}
        />
        <Badge className="max-w-28 truncate" variant="secondary">
          {save.isPending
            ? t('editor.saveState.saving')
            : dirty || nameDirty
              ? t('editor.saveState.unsaved')
              : t('editor.saveState.saved')}
        </Badge>
        <Badge variant={workflowStatus === 'failed' ? 'destructive' : 'outline'}>
          {t(`status.${workflowStatus}`)}
        </Badge>
        {save.error ? (
          <span className="text-destructive min-w-0 flex-1 truncate text-xs">
            {save.error instanceof Error ? save.error.message : t('editor.saveFailed')}
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
          <span className="max-w-32 truncate">{t('editor.saveAndValidate')}</span>
        </Button>
        {running ? (
          <Button size="sm" variant="destructive" onClick={() => void stopRun()}>
            {t('editor.stop')}
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={!startConfig.success || starting}
            onClick={() => setRunDialogOpen(true)}
          >
            {starting ? t('editor.preparing') : t('editor.run')}
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
