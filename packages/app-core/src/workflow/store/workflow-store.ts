import { create } from 'zustand';
import { WorkflowGraphSchema, type WorkflowGraph } from '@ai-engine/contracts';
import { createCanvasSlice, type CanvasSlice } from './canvas-slice';
import { createHistorySlice, type HistorySlice } from './history-slice';
import { createRuntimeSlice, type RuntimeSlice } from './runtime-slice';
import type { CanvasEdge, CanvasNode } from '../types';

export type WorkflowStore = CanvasSlice & HistorySlice & RuntimeSlice;

export const useWorkflowStore = create<WorkflowStore>()((...args) => ({
  ...createCanvasSlice(...args),
  ...createHistorySlice(...args),
  ...createRuntimeSlice(...args),
}));

export const serializeWorkflowGraph = (
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  viewport: { x: number; y: number; zoom: number },
): WorkflowGraph =>
  WorkflowGraphSchema.parse({
    nodes: nodes.map((node) => ({
      id: node.id,
      type: 'custom-node',
      position: node.position,
      data: {
        type: node.data.type,
        title: node.data.title,
        config: node.data.config,
      },
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
    })),
    viewport,
  });

export const loadWorkflowGraph = (graph: WorkflowGraph): void => {
  useWorkflowStore.setState({
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: 'custom-node',
      position: node.position,
      data: { ...node.data, _runningStatus: 'idle' },
    })),
    edges: graph.edges.map((edge) => ({ ...edge })),
    viewport: graph.viewport,
    selectedNodeId: null,
    panelOpen: false,
    dirty: false,
    past: [],
    future: [],
    running: false,
    runId: null,
    logs: [],
    workflowStatus: 'idle',
  });
};
