import { Button } from '@ai-engine/ui';
import { NodeDefinitions } from '../nodes/registry';
import type { CanvasNode } from '../types';

const categories = ['流程', '数据', 'AI', '工具'] as const;

export const BlockSelector = ({
  nodes,
  onAdd,
}: {
  nodes: CanvasNode[];
  onAdd: (type: keyof typeof NodeDefinitions) => void;
}) => (
  <aside className="border-border bg-card flex w-52 shrink-0 flex-col gap-4 overflow-y-auto border-r p-3">
    <div>
      <h2 className="text-sm font-semibold">节点</h2>
      <p className="text-muted-foreground text-xs">拖拽或点击添加</p>
    </div>
    {categories.map((category) => (
      <section className="flex flex-col gap-2" key={category}>
        <h3 className="text-muted-foreground text-xs font-medium">{category}</h3>
        {Object.values(NodeDefinitions)
          .filter((definition) => definition.category === category)
          .map((definition) => {
            const singleton =
              definition.singleton === true &&
              nodes.some((node) => node.data.type === definition.type);
            return (
              <Button
                className="h-auto justify-start px-3 py-2 text-left"
                disabled={singleton}
                draggable={!singleton}
                key={definition.type}
                variant="outline"
                onClick={() => onAdd(definition.type)}
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/ai-engine-node', definition.type);
                  event.dataTransfer.effectAllowed = 'move';
                }}
              >
                <span className="flex flex-col items-start">
                  <span>{definition.title}</span>
                  <span className="text-muted-foreground text-[11px] font-normal">
                    {definition.description}
                  </span>
                </span>
              </Button>
            );
          })}
      </section>
    ))}
  </aside>
);
