import { useCallback, useRef, type CSSProperties } from 'react';
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type NodeTypes,
  type XYPosition,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NodeTypeSchema, type NodeType } from '@ai-engine/contracts';
import { NodeDefinitions } from '../nodes/registry';
import { useWorkflowStore } from '../store/workflow-store';
import type { CanvasEdge, CanvasNode } from '../types';
import { canConnectNodes } from '../graph-utils';
import { BlockSelector } from './block-selector';
import { CustomNode } from './custom-node';

const nodeTypes: NodeTypes = { 'custom-node': CustomNode };
const canvasTheme = {
  '--xy-background-color-default': 'var(--background)',
  '--xy-background-pattern-dot-color-default': 'var(--muted-foreground)',
  '--xy-edge-stroke-default': 'var(--border)',
  '--xy-edge-stroke-selected-default': 'var(--primary)',
  '--xy-connectionline-stroke-default': 'var(--primary)',
  '--xy-minimap-background-color-default': 'var(--card)',
  '--xy-minimap-node-background-color-default': 'var(--muted)',
  '--xy-controls-button-background-color-default': 'var(--card)',
  '--xy-controls-button-background-color-hover-default': 'var(--accent)',
  '--xy-controls-button-color-default': 'var(--foreground)',
  '--xy-controls-button-border-color-default': 'var(--border)',
} as CSSProperties;

const CanvasInner = () => {
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const viewport = useWorkflowStore((state) => state.viewport);
  const onNodesChange = useWorkflowStore((state) => state.onNodesChange);
  const onEdgesChange = useWorkflowStore((state) => state.onEdgesChange);
  const setEdges = useWorkflowStore((state) => state.setEdges);
  const setViewport = useWorkflowStore((state) => state.setViewport);
  const selectNode = useWorkflowStore((state) => state.selectNode);
  const recordSnapshot = useWorkflowStore((state) => state.recordSnapshot);
  const undo = useWorkflowStore((state) => state.undo);
  const redo = useWorkflowStore((state) => state.redo);
  const copiedNode = useRef<CanvasNode | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  const addNode = useCallback(
    (type: NodeType, position?: XYPosition) => {
      const definition = NodeDefinitions[type];
      if (definition.singleton && nodes.some((node) => node.data.type === type)) return;
      recordSnapshot();
      const id = `${type}_${Date.now().toString(36)}`;
      useWorkflowStore.setState((state) => ({
        nodes: [
          ...state.nodes,
          {
            id,
            type: 'custom-node',
            position: position ?? {
              x: 120 + state.nodes.length * 36,
              y: 100 + state.nodes.length * 20,
            },
            data: {
              type,
              title: definition.title,
              config: structuredClone(definition.defaultConfig),
              _runningStatus: 'idle',
            },
          },
        ],
        dirty: true,
        selectedNodeId: id,
        panelOpen: true,
      }));
    },
    [nodes, recordSnapshot],
  );

  const isValidConnection = useCallback(
    (connection: Connection | CanvasEdge): boolean => canConnectNodes(connection, nodes, edges),
    [edges, nodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!isValidConnection(connection)) return;
      recordSnapshot();
      setEdges(addEdge({ ...connection, id: `edge_${Date.now().toString(36)}` }, edges));
    },
    [edges, isValidConnection, recordSnapshot, setEdges],
  );
  const applyNodeChanges = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      if (changes.some((change) => change.type === 'remove')) recordSnapshot();
      onNodesChange(changes);
    },
    [onNodesChange, recordSnapshot],
  );
  const applyEdgeChanges = useCallback(
    (changes: EdgeChange<CanvasEdge>[]) => {
      if (changes.some((change) => change.type === 'remove')) recordSnapshot();
      onEdgesChange(changes);
    },
    [onEdgesChange, recordSnapshot],
  );

  return (
    <div
      className="flex min-h-0 flex-1 outline-none"
      tabIndex={0}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) redo();
          else undo();
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
          copiedNode.current = nodes.find((node) => node.selected) ?? null;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
          const copied = copiedNode.current;
          if (copied && !NodeDefinitions[copied.data.type].singleton) {
            recordSnapshot();
            const id = `${copied.data.type}_${Date.now().toString(36)}`;
            useWorkflowStore.setState((state) => ({
              nodes: [
                ...state.nodes,
                {
                  ...structuredClone(copied),
                  id,
                  selected: true,
                  position: { x: copied.position.x + 32, y: copied.position.y + 32 },
                  data: { ...structuredClone(copied.data), _runningStatus: 'idle' },
                },
              ],
              selectedNodeId: id,
              panelOpen: true,
              dirty: true,
            }));
          }
        }
      }}
    >
      <BlockSelector nodes={nodes} onAdd={addNode} />
      <div
        className="bg-muted/20 min-w-0 flex-1"
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(event) => {
          event.preventDefault();
          const value = event.dataTransfer.getData('application/ai-engine-node');
          const type = NodeTypeSchema.safeParse(value);
          if (type.success) {
            addNode(type.data, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
          }
        }}
      >
        <ReactFlow
          style={canvasTheme}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          viewport={viewport}
          deleteKeyCode={['Backspace', 'Delete']}
          isValidConnection={isValidConnection}
          onlyRenderVisibleElements
          onConnect={onConnect}
          onEdgesChange={applyEdgeChanges}
          onNodesChange={applyNodeChanges}
          onNodeClick={(_, node) => selectNode(node.id)}
          onNodeDragStart={recordSnapshot}
          onPaneClick={() => selectNode(null)}
          onViewportChange={setViewport}
        >
          <Background variant={BackgroundVariant.Dots} />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </div>
  );
};

export const WorkflowCanvas = () => (
  <ReactFlowProvider>
    <CanvasInner />
  </ReactFlowProvider>
);
