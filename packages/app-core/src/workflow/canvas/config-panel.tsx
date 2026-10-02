import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Input, Separator } from '@ai-engine/ui';
import { useTranslation } from 'react-i18next';
import { PanelComponentMap } from '../nodes/registry';
import { useWorkflowStore } from '../store/workflow-store';
import type { CanvasEdge, CanvasNode } from '../types';
import { NodeDebugPanel } from './node-debug-panel';

export const ConfigPanel = ({
  node,
  nodes,
  edges,
  onClose,
  onConfigChange,
  onTitleChange,
  debugPanel,
}: {
  node: CanvasNode;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  onClose: () => void;
  onConfigChange: (config: Record<string, unknown>) => void;
  onTitleChange: (title: string) => void;
  debugPanel: ReactNode;
}) => {
  const { t } = useTranslation('workflow');
  const Panel = PanelComponentMap[node.data.type];
  const [title, setTitle] = useState(node.data.title ?? '');
  return (
    <aside className="border-border bg-card flex w-80 min-w-0 shrink-0 flex-col overflow-hidden border-l">
      <header className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{t('canvas.configTitle')}</h2>
          <p className="text-muted-foreground truncate text-xs">{node.id}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t('canvas.close')}
        </Button>
      </header>
      <Separator />
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">{t('canvas.nodeTitle')}</span>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => onTitleChange(title.trim())}
          />
        </div>
        <Separator />
        <Panel node={node} nodes={nodes} edges={edges} onChange={onConfigChange} />
        <Separator />
        {debugPanel}
      </div>
    </aside>
  );
};

export const WorkflowConfigPanel = ({
  workflowId,
  beforeDebugRun,
}: {
  workflowId: string;
  beforeDebugRun: () => Promise<void>;
}) => {
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId);
  const node = useWorkflowStore((state) =>
    state.nodes.find((item) => item.id === state.selectedNodeId),
  );
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const selectNode = useWorkflowStore((state) => state.selectNode);
  const updateNodeConfig = useWorkflowStore((state) => state.updateNodeConfig);
  const updateNodeTitle = useWorkflowStore((state) => state.updateNodeTitle);
  const recordSnapshot = useWorkflowStore((state) => state.recordSnapshot);
  if (!node || !selectedNodeId) return null;
  return (
    <ConfigPanel
      key={node.id}
      node={node}
      nodes={nodes}
      edges={edges}
      onClose={() => selectNode(null)}
      onConfigChange={(config) => {
        recordSnapshot();
        updateNodeConfig(node.id, config);
      }}
      onTitleChange={(title) => {
        if (!title) return;
        recordSnapshot();
        updateNodeTitle(node.id, title);
      }}
      debugPanel={
        <NodeDebugPanel workflowId={workflowId} nodeId={node.id} beforeRun={beforeDebugRun} />
      }
    />
  );
};
