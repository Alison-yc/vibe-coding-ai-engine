import {
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type NodeChange,
  type Viewport,
} from '@xyflow/react';
import type { StateCreator } from 'zustand';
import type { CanvasEdge, CanvasNode } from '../types';
import { syncSourceHandleEdges } from '../graph-utils';
import { NodeMetadataMap } from '../nodes/metadata';

export type CanvasSlice = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport;
  selectedNodeId: string | null;
  panelOpen: boolean;
  dirty: boolean;
  loadGraph: (nodes: CanvasNode[], edges: CanvasEdge[], viewport: Viewport) => void;
  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void;
  setEdges: (edges: CanvasEdge[]) => void;
  setViewport: (viewport: Viewport) => void;
  selectNode: (nodeId: string | null) => void;
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  updateNodeTitle: (nodeId: string, title: string) => void;
  markSaved: () => void;
};

export const createCanvasSlice: StateCreator<CanvasSlice, [], [], CanvasSlice> = (set) => ({
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedNodeId: null,
  panelOpen: false,
  dirty: false,
  loadGraph: (nodes, edges, viewport) =>
    set({ nodes, edges, viewport, selectedNodeId: null, panelOpen: false, dirty: false }),
  onNodesChange: (changes) =>
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
      dirty:
        state.dirty ||
        changes.some((change) => change.type !== 'select' && change.type !== 'dimensions'),
    })),
  onEdgesChange: (changes) =>
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
      dirty: state.dirty || changes.some((change) => change.type !== 'select'),
    })),
  setEdges: (edges) => set({ edges, dirty: true }),
  setViewport: (viewport) => set({ viewport, dirty: true }),
  selectNode: (selectedNodeId) => set({ selectedNodeId, panelOpen: selectedNodeId !== null }),
  updateNodeConfig: (nodeId, config) =>
    set((state) => {
      const node = state.nodes.find((item) => item.id === nodeId);
      if (!node) return state;
      const getSourceHandles = NodeMetadataMap[node.data.type].getSourceHandles;
      const previousHandles = getSourceHandles?.(node.data.config) ?? [];
      const nextHandles = getSourceHandles?.(config) ?? [];
      return {
        nodes: state.nodes.map((item) =>
          item.id === nodeId ? { ...item, data: { ...item.data, config } } : item,
        ),
        edges:
          previousHandles.length > 0 && nextHandles.length > 0
            ? syncSourceHandleEdges(nodeId, previousHandles, nextHandles, state.edges)
            : state.edges,
        dirty: true,
      };
    }),
  updateNodeTitle: (nodeId, title) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, title } } : node,
      ),
      dirty: true,
    })),
  markSaved: () => set({ dirty: false }),
});
