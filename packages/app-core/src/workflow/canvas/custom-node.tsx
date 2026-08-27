import { memo, type ReactNode } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@ai-engine/ui';
import { NodeMetadataMap } from '../nodes/metadata';
import { NodeComponentMap } from '../nodes/registry';
import type { CanvasNode, NodeRunningStatus } from '../types';

const statusClass: Record<NodeRunningStatus, string> = {
  idle: 'border-border',
  running: 'border-primary ring-primary/30 animate-pulse ring-2',
  completed: 'border-chart-2 ring-chart-2/20 ring-1',
  failed: 'border-destructive ring-destructive/20 ring-2',
  stopped: 'border-muted-foreground',
};

const BaseNode = ({
  data,
  selected,
  children,
}: Pick<NodeProps<CanvasNode>, 'data' | 'selected'> & { children: ReactNode }) => {
  const status = data._runningStatus ?? 'idle';
  const metadata = NodeMetadataMap[data.type];
  const sourceHandles = metadata.getSourceHandles?.(data.config) ?? [];
  return (
    <div
      className={cn(
        'bg-card text-card-foreground relative rounded-lg border-2 px-4 py-3 shadow-sm transition-[border-color,box-shadow]',
        statusClass[status],
        selected && 'ring-ring ring-2',
      )}
    >
      {metadata.acceptsInput ? (
        <Handle type="target" position={Position.Left} aria-label="输入连接桩" />
      ) : null}
      {children}
      {data._validationErrors?.length ? (
        <span
          className="bg-destructive text-destructive-foreground absolute -top-2 -right-2 grid size-5 place-items-center rounded-full text-xs"
          title={data._validationErrors.join('\n')}
        >
          !
        </span>
      ) : null}
      {metadata.providesOutput && sourceHandles.length === 0 ? (
        <Handle type="source" position={Position.Right} aria-label="输出连接桩" />
      ) : null}
      {sourceHandles.map((handle, index) => (
        <Handle
          key={handle}
          id={handle}
          type="source"
          position={Position.Right}
          aria-label={`分支 ${handle}`}
          style={{ top: `${((index + 1) / (sourceHandles.length + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
};

export const CustomNode = memo((props: NodeProps<CanvasNode>) => {
  const Body = NodeComponentMap[props.data.type];
  return (
    <BaseNode data={props.data} selected={props.selected}>
      <Body data={props.data} />
    </BaseNode>
  );
});
CustomNode.displayName = 'CustomNode';
