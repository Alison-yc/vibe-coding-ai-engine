import { Button, Input } from '@ai-engine/ui';
import { CodeNodeConfigSchema } from '@ai-engine/contracts';
import { useTranslation } from 'react-i18next';
import { CodeEditor } from '../../code-editor';
import { VariableSelector, variableOptionsForNode } from '../../variable-selector';
import { configWithDraft, PanelSection } from '../common';
import type { NodePanelProps } from '../types';
import { useConfigDraft } from '../use-config-draft';
import { codeDefaultConfig } from './default';

export const CodeNodePanel = ({ node, nodes, edges, onChange }: NodePanelProps) => {
  const { t } = useTranslation('workflow');
  const [draft, setDraft] = useConfigDraft(node.id, node.data.config, onChange);
  const parsed = CodeNodeConfigSchema.safeParse(draft);
  const config = parsed.success
    ? parsed.data
    : configWithDraft(CodeNodeConfigSchema.parse(codeDefaultConfig), draft);
  const inputs = Object.entries(config.inputs);
  const fallbackSelector = variableOptionsForNode(node.id, nodes, edges, t)[0]?.selector ?? [
    'sys',
    'query',
  ];
  return (
    <PanelSection title={t('panels.code.title')} description={t('panels.code.description')}>
      {inputs.map(([name, selector], index) => (
        <div className="border-border flex flex-col gap-2 rounded-md border p-3" key={name}>
          <Input
            aria-label={t('panels.code.inputName', { index: index + 1 })}
            value={name}
            onChange={(event) => {
              const next = { ...config.inputs };
              delete next[name];
              next[event.target.value] = selector;
              setDraft({ ...config, inputs: next });
            }}
          />
          <VariableSelector
            label={t('variables.source')}
            nodeId={node.id}
            nodes={nodes}
            edges={edges}
            value={selector}
            onChange={(value) =>
              setDraft({ ...config, inputs: { ...config.inputs, [name]: value } })
            }
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const next = { ...config.inputs };
              delete next[name];
              setDraft({ ...config, inputs: next });
            }}
          >
            {t('panels.code.deleteInput')}
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          setDraft({
            ...config,
            inputs: {
              ...config.inputs,
              [`input_${inputs.length + 1}`]: fallbackSelector,
            },
          })
        }
      >
        {t('panels.code.addInput')}
      </Button>
      <CodeEditor
        ariaLabel={t('panels.code.editor')}
        value={config.code}
        onChange={(code) => setDraft({ ...config, code })}
      />
    </PanelSection>
  );
};
