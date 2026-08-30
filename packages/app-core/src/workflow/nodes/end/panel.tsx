import { Button, Input } from '@ai-engine/ui';
import { EndNodeConfigSchema, type ValueSelector } from '@ai-engine/contracts';
import { useTranslation } from 'react-i18next';
import { VariableSelector, variableOptionsForNode } from '../../variable-selector';
import { configWithDraft, PanelSection } from '../common';
import type { NodePanelProps } from '../types';
import { useConfigDraft } from '../use-config-draft';
import { endDefaultConfig } from './default';

export const EndNodePanel = ({ node, nodes, edges, onChange }: NodePanelProps) => {
  const { t } = useTranslation('workflow');
  const [draft, setDraft] = useConfigDraft(node.id, node.data.config, onChange);
  const parsed = EndNodeConfigSchema.safeParse(draft);
  const outputs = parsed.success
    ? parsed.data.outputs
    : configWithDraft(EndNodeConfigSchema.parse(endDefaultConfig), draft).outputs;
  const fallbackSelector = variableOptionsForNode(node.id, nodes, edges, t)[0]?.selector ?? [
    'sys',
    'query',
  ];
  const update = (index: number, patch: Record<string, unknown>) =>
    setDraft({
      outputs: outputs.map((output, current) =>
        current === index ? { ...output, ...patch } : output,
      ),
    });
  const updateSelector = (outputIndex: number, sourceIndex: number, selector: ValueSelector) => {
    const output = outputs[outputIndex];
    if (!output) return;
    if (sourceIndex === 0) {
      update(outputIndex, { selector });
      return;
    }
    const fallbackSelectors = [...(output.fallbackSelectors ?? [])];
    fallbackSelectors[sourceIndex - 1] = selector;
    update(outputIndex, { fallbackSelectors });
  };
  return (
    <PanelSection title={t('panels.end.title')}>
      {outputs.map((output, outputIndex) => (
        <div
          className="border-border flex flex-col gap-3 rounded-md border p-3"
          key={`${outputIndex}`}
        >
          <Input
            aria-label={t('panels.end.outputName', { index: outputIndex + 1 })}
            value={output.name}
            onChange={(event) => update(outputIndex, { name: event.target.value })}
          />
          {[output.selector, ...(output.fallbackSelectors ?? [])].map((selector, sourceIndex) => (
            <div
              className="bg-muted/40 flex flex-col gap-2 rounded-md border p-2"
              key={sourceIndex}
            >
              <VariableSelector
                label={t('panels.end.sourcePriority', { index: sourceIndex + 1 })}
                nodeId={node.id}
                nodes={nodes}
                edges={edges}
                value={selector}
                onChange={(nextSelector) => updateSelector(outputIndex, sourceIndex, nextSelector)}
              />
              <Input
                aria-label={t('panels.end.propertyPath', { index: sourceIndex + 1 })}
                placeholder={t('panels.end.propertyPathPlaceholder')}
                value={selector.slice(2).join('.')}
                onChange={(event) => {
                  const raw = event.target.value;
                  const segments = raw.split('.').map((segment) => segment.trim());
                  const path = raw.endsWith('.')
                    ? [...segments.slice(0, -1).filter(Boolean), '']
                    : segments.filter(Boolean);
                  updateSelector(outputIndex, sourceIndex, [...selector.slice(0, 2), ...path]);
                }}
                onBlur={() => {
                  const cleaned = selector.slice(2).filter(Boolean);
                  updateSelector(outputIndex, sourceIndex, [...selector.slice(0, 2), ...cleaned]);
                }}
              />
              {sourceIndex > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    update(outputIndex, {
                      fallbackSelectors: (output.fallbackSelectors ?? []).filter(
                        (_, index) => index !== sourceIndex - 1,
                      ),
                    })
                  }
                >
                  {t('panels.end.deleteFallback')}
                </Button>
              ) : null}
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              update(outputIndex, {
                fallbackSelectors: [...(output.fallbackSelectors ?? []), fallbackSelector],
              })
            }
          >
            {t('panels.end.addFallback')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={outputs.length === 1}
            onClick={() =>
              setDraft({ outputs: outputs.filter((_, current) => current !== outputIndex) })
            }
          >
            {t('panels.end.delete')}
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          setDraft({
            outputs: [
              ...outputs,
              { name: `output_${outputs.length + 1}`, selector: fallbackSelector },
            ],
          })
        }
      >
        {t('panels.end.add')}
      </Button>
    </PanelSection>
  );
};
