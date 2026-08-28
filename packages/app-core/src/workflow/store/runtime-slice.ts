import type { StateCreator } from 'zustand';
import type { WorkflowRunEvent } from '@ai-engine/contracts';
import type { CanvasSlice } from './canvas-slice';
import type { RuntimeLog, WorkflowRuntimeState } from '../types';

export type RuntimeSlice = WorkflowRuntimeState;
type RuntimeStore = CanvasSlice & RuntimeSlice;

const updateLog = (
  logs: RuntimeLog[],
  nodeId: string,
  update: (log: RuntimeLog) => RuntimeLog,
): RuntimeLog[] => logs.map((log) => (log.nodeId === nodeId ? update(log) : log));

export const createRuntimeSlice: StateCreator<RuntimeStore, [], [], RuntimeSlice> = (set) => ({
  running: false,
  runId: null,
  logs: [],
  workflowStatus: 'idle',
  resetRuntime: () =>
    set((state) => ({
      running: false,
      runId: null,
      logs: [],
      workflowStatus: 'idle',
      nodes: state.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          _runningStatus: 'idle',
          _validationErrors: undefined,
        },
      })),
    })),
  applyRuntimeEvent: (event: WorkflowRunEvent) => set((state) => applyRuntimeEvent(state, event)),
});

export const applyRuntimeEvent = (
  state: Pick<RuntimeStore, 'nodes' | 'logs' | 'runId' | 'running' | 'workflowStatus'>,
  event: WorkflowRunEvent,
): Partial<RuntimeStore> => {
  if (event.event === 'workflow_started') {
    return {
      running: true,
      runId: event.data.runId,
      workflowStatus: 'running',
      logs: [],
      nodes: state.nodes.map((node) => ({
        ...node,
        data: { ...node.data, _runningStatus: 'idle', _validationErrors: undefined },
      })),
    };
  }
  if (event.event === 'node_started') {
    return {
      nodes: state.nodes.map((node) =>
        node.id === event.data.nodeId
          ? { ...node, data: { ...node.data, _runningStatus: 'running' } }
          : node,
      ),
      logs: [
        ...state.logs.filter((log) => log.nodeId !== event.data.nodeId),
        {
          id: `node:${event.data.nodeId}`,
          nodeId: event.data.nodeId,
          status: 'running',
          title:
            state.nodes.find((node) => node.id === event.data.nodeId)?.data.title ??
            event.data.nodeId,
          inputs: event.data.inputs,
          text: '',
        },
      ],
    };
  }
  if (event.event === 'node_stream_chunk') {
    return {
      logs: updateLog(state.logs, event.data.nodeId, (log) => ({
        ...log,
        text: log.text + event.data.text,
      })),
    };
  }
  if (event.event === 'node_finished') {
    return {
      nodes: state.nodes.map((node) =>
        node.id === event.data.nodeId
          ? { ...node, data: { ...node.data, _runningStatus: event.data.status } }
          : node,
      ),
      logs: updateLog(state.logs, event.data.nodeId, (log) => ({
        ...log,
        status: event.data.status,
        outputs: event.data.outputs,
        elapsedMs: event.data.elapsedMs,
      })),
    };
  }
  if (event.event === 'node_failed') {
    return {
      nodes: state.nodes.map((node) =>
        node.id === event.data.nodeId
          ? { ...node, data: { ...node.data, _runningStatus: 'failed' } }
          : node,
      ),
      logs: updateLog(state.logs, event.data.nodeId, (log) => ({
        ...log,
        status: 'failed',
        error: event.data.error,
      })),
    };
  }
  if (event.event === 'workflow_finished') {
    return {
      running: false,
      workflowStatus: event.data.status,
      logs: [
        ...state.logs,
        {
          id: `workflow:${event.data.runId}`,
          status: event.data.status,
          title: '',
          titleKey:
            event.data.status === 'stopped' ? 'editor.workflowStopped' : 'editor.workflowCompleted',
          outputs: event.data.outputs,
          elapsedMs: event.data.totalElapsedMs,
          text: '',
        },
      ],
    };
  }
  return {
    running: false,
    workflowStatus: 'failed',
    logs: [
      ...state.logs,
      {
        id: `workflow:${event.data.runId}`,
        nodeId: event.data.failedNodeId,
        status: 'failed',
        title: '',
        titleKey: 'editor.workflowFailed',
        error: event.data.error,
        text: '',
      },
    ],
  };
};
