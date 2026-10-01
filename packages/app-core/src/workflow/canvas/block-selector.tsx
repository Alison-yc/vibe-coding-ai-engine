import { cn } from '@ai-engine/ui';
import { useTranslation } from 'react-i18next';
import { NodeDefinitions } from '../nodes/registry';
import { getNodePresentation, type NodeCategory } from '../nodes/metadata';
import { NodeIconMap, categoryBorderClass } from '../nodes/visual';
import type { NodeType } from '@ai-engine/contracts';
import type { CanvasNode } from '../types';
import type { PointerEvent as ReactPointerEvent } from 'react';

const categories: NodeCategory[] = ['flow', 'data', 'ai', 'tools'];

const categoryHeadingClass: Record<NodeCategory, string> = {
  flow: 'text-node-cat-flow',
  data: 'text-node-cat-data',
  ai: 'text-node-cat-ai',
  tools: 'text-node-cat-tools',
};

export const BlockSelector = ({
  nodes,
  onAdd,
  onPalettePointerDown,
  consumePointerClick,
}: {
  nodes: CanvasNode[];
  onAdd: (type: keyof typeof NodeDefinitions) => void;
  onPalettePointerDown: (
    type: NodeType,
    label: string,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  consumePointerClick: () => boolean;
}) => {
  const { t } = useTranslation('workflow');
  return (
    <aside className="border-border bg-sidebar flex w-52 shrink-0 flex-col gap-4 overflow-y-auto border-r p-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold">{t('canvas.nodes')}</h2>
        <p className="text-muted-foreground truncate text-xs">{t('canvas.addHint')}</p>
      </div>
      {categories.map((category) => (
        <section className="flex min-w-0 flex-col gap-2" key={category}>
          <h3
            className={cn(
              'truncate text-xs font-semibold tracking-wide uppercase',
              categoryHeadingClass[category],
            )}
          >
            {t(`canvas.categories.${category}`)}
          </h3>
          {Object.values(NodeDefinitions)
            .filter((definition) => getNodePresentation(t, definition.type).category === category)
            .map((definition) => {
              const presentation = getNodePresentation(t, definition.type);
              const Icon = NodeIconMap[definition.type];
              const singleton =
                definition.singleton === true &&
                nodes.some((node) => node.data.type === definition.type);
              return (
                <div
                  key={definition.type}
                  role="button"
                  tabIndex={singleton ? -1 : 0}
                  aria-disabled={singleton}
                  className={cn(
                    'border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-auto min-w-0 cursor-grab justify-start rounded-md border border-l-4 px-3 py-2 text-left text-sm font-medium shadow-xs active:cursor-grabbing',
                    categoryBorderClass[category],
                    singleton && 'pointer-events-none opacity-50',
                  )}
                  onPointerDown={(event) => {
                    if (!singleton)
                      onPalettePointerDown(definition.type, presentation.title, event);
                  }}
                  onClick={() => {
                    if (singleton || consumePointerClick()) return;
                    onAdd(definition.type);
                  }}
                  onKeyDown={(event) => {
                    if (singleton) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onAdd(definition.type);
                    }
                  }}
                >
                  <span className="flex min-w-0 items-start gap-2">
                    <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                    <span className="flex min-w-0 flex-col items-start">
                      <span className="max-w-full truncate">{presentation.title}</span>
                      <span className="text-muted-foreground line-clamp-2 text-[11px] font-normal">
                        {presentation.description}
                      </span>
                    </span>
                  </span>
                </div>
              );
            })}
        </section>
      ))}
    </aside>
  );
};
