import { Button } from '@ai-engine/ui';
import { useTranslation } from 'react-i18next';
import { NodeDefinitions } from '../nodes/registry';
import { getNodePresentation, type NodeCategory } from '../nodes/metadata';
import type { CanvasNode } from '../types';

const categories: NodeCategory[] = ['flow', 'data', 'ai', 'tools'];

export const BlockSelector = ({
  nodes,
  onAdd,
}: {
  nodes: CanvasNode[];
  onAdd: (type: keyof typeof NodeDefinitions) => void;
}) => {
  const { t } = useTranslation('workflow');
  return (
    <aside className="border-border bg-card flex w-52 shrink-0 flex-col gap-4 overflow-y-auto border-r p-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold">{t('canvas.nodes')}</h2>
        <p className="text-muted-foreground truncate text-xs">{t('canvas.addHint')}</p>
      </div>
      {categories.map((category) => (
        <section className="flex min-w-0 flex-col gap-2" key={category}>
          <h3 className="text-muted-foreground truncate text-xs font-medium">
            {t(`canvas.categories.${category}`)}
          </h3>
          {Object.values(NodeDefinitions)
            .filter((definition) => getNodePresentation(t, definition.type).category === category)
            .map((definition) => {
              const presentation = getNodePresentation(t, definition.type);
              const singleton =
                definition.singleton === true &&
                nodes.some((node) => node.data.type === definition.type);
              return (
                <Button
                  className="h-auto min-w-0 justify-start px-3 py-2 text-left"
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
                  <span className="flex min-w-0 flex-col items-start">
                    <span className="max-w-full truncate">{presentation.title}</span>
                    <span className="text-muted-foreground line-clamp-2 text-[11px] font-normal">
                      {presentation.description}
                    </span>
                  </span>
                </Button>
              );
            })}
        </section>
      ))}
    </aside>
  );
};
