import type { Edge, Node, Viewport } from '@xyflow/react';
import type { NodeType, WorkflowGraph, WorkflowRunEvent } from '@ai-engine/contracts';

export type NodeRunningStatus = 'idle' | 'running' | 'completed' | 'failed' | 'stopped';

export type WorkflowNodeData = {
  type: NodeType;
  title?: string;
  config: Record<string, unknown>;
  _runningStatus?: NodeRunningStatus;
  _validationErrors?: string[];
};

export type CanvasNode = Node<WorkflowNodeData, 'custom-node'>;
export type CanvasEdge = Edge;

export type GraphSnapshot = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport;
};

export type RuntimeLog = {
  id: string;
  nodeId?: string;
  status: NodeRunningStatus;
  title: string;
  titleKey?: 'editor.workflowStopped' | 'editor.workflowCompleted' | 'editor.workflowFailed';
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  text: string;
  error?: string;
  elapsedMs?: number;
};

export type WorkflowRuntimeState = {
  running: boolean;
  runId: string | null;
  logs: RuntimeLog[];
  workflowStatus: 'idle' | 'running' | 'completed' | 'failed' | 'stopped';
  applyRuntimeEvent: (event: WorkflowRunEvent) => void;
  resetRuntime: () => void;
};

export type PersistableGraph = WorkflowGraph;
