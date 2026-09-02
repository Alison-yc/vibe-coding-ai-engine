import { memo, type ReactNode } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@ai-engine/ui';
import { useTranslation } from 'react-i18next';
import { NodeMetadataMap } from '../nodes/metadata';
import { NodeComponentMap } from '../nodes/registry';
import type { CanvasNode, NodeRunningStatus } from '../types';

const statusClass: Record<NodeRunningStatus, string> = {
  idle: 'border-node-idle',
  running: 'border-node-running ring-node-running/30 animate-pulse ring-2',
  completed: 'border-node-success ring-node-success/20 ring-1',
  failed: 'border-node-error ring-node-error/20 ring-2',
  stopped: 'border-node-idle/70',
};

const BaseNode = ({
  data,
  selected,
  children,
}: Pick<NodeProps<CanvasNode>, 'data' | 'selected'> & { children: ReactNode }) => {
  const { t } = useTranslation('workflow');
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
        <Handle type="target" position={Position.Left} aria-label={t('canvas.inputHandle')} />
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
        <Handle type="source" position={Position.Right} aria-label={t('canvas.outputHandle')} />
      ) : null}
      {sourceHandles.map((handle, index) => (
        <Handle
          key={handle}
          id={handle}
          type="source"
          position={Position.Right}
          aria-label={t('canvas.branchHandle', { branch: handle })}
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
