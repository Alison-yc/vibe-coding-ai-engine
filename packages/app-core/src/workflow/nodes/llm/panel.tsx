import { Input } from '@ai-engine/ui';
import { LlmNodeConfigSchema } from '@ai-engine/contracts';
import { useTranslation } from 'react-i18next';
import { TemplateEditor } from '../../template-editor';
import { configWithDraft, PanelSection } from '../common';
import type { NodePanelProps } from '../types';
import { useConfigDraft } from '../use-config-draft';
import { llmDefaultConfig } from './default';

export const LlmNodePanel = ({ node, nodes, edges, onChange }: NodePanelProps) => {
  const { t } = useTranslation('workflow');
  const [draft, setDraft] = useConfigDraft(node.id, node.data.config, onChange);
  const parsed = LlmNodeConfigSchema.safeParse(draft);
  const config = parsed.success
    ? parsed.data
    : configWithDraft(LlmNodeConfigSchema.parse(llmDefaultConfig), draft);
  return (
    <PanelSection title={t('panels.llm.title')}>
      <TemplateEditor
        label={t('panels.llm.systemPrompt')}
        value={config.systemPrompt ?? ''}
        nodeId={node.id}
        nodes={nodes}
        edges={edges}
        onChange={(systemPrompt) => setDraft({ ...config, systemPrompt })}
      />
      <TemplateEditor
        label={t('panels.llm.userPrompt')}
        value={config.prompt}
        nodeId={node.id}
        nodes={nodes}
        edges={edges}
        onChange={(prompt) => setDraft({ ...config, prompt })}
      />
      <Input
        aria-label={t('panels.llm.maxTokens')}
        type="number"
        min={1}
        value={config.numPredict ?? ''}
        onChange={(event) =>
          setDraft({
            ...config,
            numPredict: event.target.value ? Number(event.target.value) : undefined,
          })
        }
      />
    </PanelSection>
  );
};
