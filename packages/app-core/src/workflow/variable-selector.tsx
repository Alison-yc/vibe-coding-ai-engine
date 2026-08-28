import { Select } from '@ai-engine/ui';
import { StartNodeConfigSchema, type ValueSelector } from '@ai-engine/contracts';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { collectUpstreamNodeIds } from './graph-utils';
import { getNodePresentation, NodeMetadataMap } from './nodes/metadata';
import type { VariableOption } from './nodes/types';
import type { CanvasEdge, CanvasNode } from './types';

const keyOf = (selector: ValueSelector): string => selector.join('\u0000');

export const variableOptionsForNode = (
  nodeId: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  t: TFunction<'workflow'>,
): VariableOption[] => {
  const upstream = collectUpstreamNodeIds(nodeId, edges);
  const start = nodes.find((node) => node.data.type === 'start');
  const startConfig = StartNodeConfigSchema.safeParse(start?.data.config);
  const options: VariableOption[] =
    start && upstream.has(start.id) && startConfig.success
      ? startConfig.data.fields.map((field) => ({
          nodeId: 'sys',
          nodeTitle: t('variables.system'),
          variable: { name: field.name, type: field.type },
          selector: ['sys', field.name],
        }))
      : [];
  for (const node of nodes) {
    if (!upstream.has(node.id)) continue;
    const metadata = NodeMetadataMap[node.data.type];
    for (const variable of metadata.getOutputVars(node.data.config)) {
      options.push({
        nodeId: node.id,
        nodeTitle: node.data.title ?? getNodePresentation(t, node.data.type).title,
        variable,
        selector: [node.id, variable.name],
      });
    }
  }
  return options;
};

export const VariableSelector = ({
  nodeId,
  nodes,
  edges,
  value,
  onChange,
  label,
}: {
  nodeId: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  value: ValueSelector;
  onChange: (selector: ValueSelector) => void;
  label: string;
}) => {
  const { t } = useTranslation('workflow');
  const options = variableOptionsForNode(nodeId, nodes, edges, t);
  const current = keyOf(value);
  const valid = options.some((option) => keyOf(option.selector) === current);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium">{label}</span>
      <Select
        aria-invalid={!valid}
        className={valid ? undefined : 'border-destructive text-destructive'}
        value={current}
        onChange={(event) => {
          const [source, field] = event.target.value.split('\u0000');
          if (source && field) onChange([source, field]);
        }}
      >
        {!valid ? (
          <option value={current}>
            {t('variables.invalidReference', { selector: value.join('.') })}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={keyOf(option.selector)} value={keyOf(option.selector)}>
            {t('variables.option', {
              nodeTitle: option.nodeTitle,
              variable: option.variable.name,
              type: option.variable.type,
            })}
          </option>
        ))}
      </Select>
      {!valid ? (
        <span className="text-destructive text-xs">{t('variables.invalidDescription')}</span>
      ) : null}
    </div>
  );
};
