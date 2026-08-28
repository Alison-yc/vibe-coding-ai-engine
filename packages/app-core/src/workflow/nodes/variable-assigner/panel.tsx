import { Button, Input, Select, Textarea } from '@ai-engine/ui';
import { VariableAssignerNodeConfigSchema } from '@ai-engine/contracts';
import { useTranslation } from 'react-i18next';
import { VariableSelector, variableOptionsForNode } from '../../variable-selector';
import { configWithDraft, formatConfigValue, PanelSection } from '../common';
import type { NodePanelProps } from '../types';
import { useConfigDraft } from '../use-config-draft';
import { variableAssignerDefaultConfig } from './default';

export const VariableAssignerNodePanel = ({ node, nodes, edges, onChange }: NodePanelProps) => {
  const { t } = useTranslation('workflow');
  const [draft, setDraft] = useConfigDraft(node.id, node.data.config, onChange);
  const parsed = VariableAssignerNodeConfigSchema.safeParse(draft);
  const assignments = parsed.success
    ? parsed.data.assignments
    : configWithDraft(VariableAssignerNodeConfigSchema.parse(variableAssignerDefaultConfig), draft)
        .assignments;
  const fallbackSelector = variableOptionsForNode(node.id, nodes, edges, t)[0]?.selector ?? [
    'sys',
    'query',
  ];
  const update = (index: number, patch: Record<string, unknown>) =>
    setDraft({
      assignments: assignments.map((assignment, current) =>
        current === index ? { ...assignment, ...patch } : assignment,
      ),
    });
  return (
    <PanelSection title={t('panels.variableAssigner.title')}>
      {assignments.map((assignment, index) => (
        <div className="border-border flex flex-col gap-2 rounded-md border p-3" key={`${index}`}>
          <Input
            aria-label={t('panels.variableAssigner.name', { index: index + 1 })}
            value={assignment.name}
            onChange={(event) => update(index, { name: event.target.value })}
          />
          <Select
            aria-label={t('panels.variableAssigner.source', { index: index + 1 })}
            value={assignment.value.source}
            onChange={(event) => {
              const source = event.target.value;
              const value =
                source === 'selector'
                  ? { source, selector: fallbackSelector }
                  : source === 'template'
                    ? { source, template: '{{#start.query#}}' }
                    : { source: 'constant', value: '' };
              update(index, { value });
            }}
          >
            <option value="constant">{t('panels.variableAssigner.constant')}</option>
            <option value="selector">{t('panels.variableAssigner.reference')}</option>
            <option value="template">{t('panels.variableAssigner.template')}</option>
          </Select>
          {assignment.value.source === 'selector' ? (
            <VariableSelector
              label={t('variables.source')}
              nodeId={node.id}
              nodes={nodes}
              edges={edges}
              value={assignment.value.selector}
              onChange={(selector) => update(index, { value: { source: 'selector', selector } })}
            />
          ) : null}
          {assignment.value.source === 'template' ? (
            <Textarea
              aria-label={t('panels.variableAssigner.templateLabel', { index: index + 1 })}
              value={assignment.value.template}
              onChange={(event) =>
                update(index, {
                  value: { source: 'template', template: event.target.value },
                })
              }
            />
          ) : null}
          {assignment.value.source === 'constant' ? (
            <Input
              aria-label={t('panels.variableAssigner.constantLabel', { index: index + 1 })}
              value={formatConfigValue(assignment.value.value)}
              onChange={(event) =>
                update(index, { value: { source: 'constant', value: event.target.value } })
              }
            />
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            disabled={assignments.length === 1}
            onClick={() =>
              setDraft({
                assignments: assignments.filter((_, current) => current !== index),
              })
            }
          >
            {t('panels.variableAssigner.delete')}
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          setDraft({
            assignments: [
              ...assignments,
              { name: `value_${assignments.length + 1}`, value: { source: 'constant', value: '' } },
            ],
          })
        }
      >
        {t('panels.variableAssigner.add')}
      </Button>
    </PanelSection>
  );
};
