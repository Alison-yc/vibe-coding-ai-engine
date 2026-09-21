import type { StateCreator } from 'zustand';
import type { GraphSnapshot } from '../types';
import type { CanvasSlice } from './canvas-slice';

export type HistorySlice = {
  past: GraphSnapshot[];
  future: GraphSnapshot[];
  recordSnapshot: () => void;
  undo: () => void;
  redo: () => void;
};

type HistoryStore = CanvasSlice & HistorySlice;

const snapshot = (state: Pick<CanvasSlice, 'nodes' | 'edges' | 'viewport'>): GraphSnapshot =>
  structuredClone({
    nodes: state.nodes.map((node) => ({
      ...node,
      data: {
        type: node.data.type,
        title: node.data.title,
        config: node.data.config,
      },
    })),
    edges: state.edges,
    viewport: state.viewport,
  });

export const createHistorySlice: StateCreator<HistoryStore, [], [], HistorySlice> = (set) => ({
  past: [],
  future: [],
  recordSnapshot: () =>
    set((state) => ({ past: [...state.past.slice(-19), snapshot(state)], future: [] })),
  undo: () =>
    set((state) => {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...structuredClone(previous),
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future].slice(0, 20),
        dirty: true,
      };
    }),
  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...structuredClone(next),
        past: [...state.past.slice(-19), snapshot(state)],
        future: state.future.slice(1),
        dirty: true,
      };
    }),
});
