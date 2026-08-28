import { useState } from 'react';
import { Button } from '@ai-engine/ui';
import type { ValueSelector } from '@ai-engine/contracts';
import { useTranslation } from 'react-i18next';
import { CodeEditor } from './code-editor';
import { VariableSelector, variableOptionsForNode } from './variable-selector';
import type { CanvasEdge, CanvasNode } from './types';

export const TemplateEditor = ({
  label,
  value,
  nodeId,
  nodes,
  edges,
  onChange,
}: {
  label: string;
  value: string;
  nodeId: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  onChange: (value: string) => void;
}) => {
  const { t } = useTranslation('workflow');
  const options = variableOptionsForNode(nodeId, nodes, edges, t);
  const [selector, setSelector] = useState<ValueSelector>(
    () => options[0]?.selector ?? ['sys', 'query'],
  );
  const validSelectors = new Set(options.map((option) => option.selector.join('.')));
  const references = [...value.matchAll(/\{\{#([^#{}]+)#\}\}/g)].map((match) => match[1] ?? '');
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium">{label}</span>
      <CodeEditor ariaLabel={label} language="template" value={value} onChange={onChange} />
      {references.length > 0 ? (
        <div aria-label={t('variables.highlight', { label })} className="flex flex-wrap gap-1">
          {references.map((reference, index) => (
            <code
              className={
                validSelectors.has(reference)
                  ? 'bg-primary/10 text-primary rounded px-1.5 py-0.5 text-xs'
                  : 'bg-destructive/10 text-destructive rounded px-1.5 py-0.5 text-xs'
              }
              key={`${reference}:${index}`}
            >
              {`{{#${reference}#}}`}
            </code>
          ))}
        </div>
      ) : null}
      <VariableSelector
        label={t('variables.insertSource')}
        nodeId={nodeId}
        nodes={nodes}
        edges={edges}
        value={selector}
        onChange={setSelector}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange(`${value}{{#${selector.join('.')}#}}`)}
      >
        {t('variables.insert')}
      </Button>
    </div>
  );
};
