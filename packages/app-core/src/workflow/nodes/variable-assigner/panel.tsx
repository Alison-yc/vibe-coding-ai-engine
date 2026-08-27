import { Button, Input, Select, Textarea } from '@ai-engine/ui';
import { VariableAssignerNodeConfigSchema } from '@ai-engine/contracts';
import { VariableSelector, variableOptionsForNode } from '../../variable-selector';
import { configWithDraft, formatConfigValue, PanelSection } from '../common';
import type { NodePanelProps } from '../types';
import { useConfigDraft } from '../use-config-draft';
import { variableAssignerDefaultConfig } from './default';

export const VariableAssignerNodePanel = ({ node, nodes, edges, onChange }: NodePanelProps) => {
  const [draft, setDraft] = useConfigDraft(node.id, node.data.config, onChange);
  const parsed = VariableAssignerNodeConfigSchema.safeParse(draft);
  const assignments = parsed.success
    ? parsed.data.assignments
    : configWithDraft(VariableAssignerNodeConfigSchema.parse(variableAssignerDefaultConfig), draft)
        .assignments;
  const fallbackSelector = variableOptionsForNode(node.id, nodes, edges)[0]?.selector ?? [
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
    <PanelSection title="变量赋值">
      {assignments.map((assignment, index) => (
        <div className="border-border flex flex-col gap-2 rounded-md border p-3" key={`${index}`}>
          <Input
            aria-label={`变量 ${index + 1} 名称`}
            value={assignment.name}
            onChange={(event) => update(index, { name: event.target.value })}
          />
          <Select
            aria-label={`变量 ${index + 1} 来源`}
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
            <option value="constant">常量</option>
            <option value="selector">变量引用</option>
            <option value="template">模板</option>
          </Select>
          {assignment.value.source === 'selector' ? (
            <VariableSelector
              label="来源变量"
              nodeId={node.id}
              nodes={nodes}
              edges={edges}
              value={assignment.value.selector}
              onChange={(selector) => update(index, { value: { source: 'selector', selector } })}
            />
          ) : null}
          {assignment.value.source === 'template' ? (
            <Textarea
              aria-label={`变量 ${index + 1} 模板`}
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
              aria-label={`变量 ${index + 1} 常量`}
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
            删除变量
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
        添加变量
      </Button>
    </PanelSection>
  );
};
