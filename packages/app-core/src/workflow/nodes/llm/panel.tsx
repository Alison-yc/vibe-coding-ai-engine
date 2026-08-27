import { Input } from '@ai-engine/ui';
import { LlmNodeConfigSchema } from '@ai-engine/contracts';
import { TemplateEditor } from '../../template-editor';
import { configWithDraft, PanelSection } from '../common';
import type { NodePanelProps } from '../types';
import { useConfigDraft } from '../use-config-draft';
import { llmDefaultConfig } from './default';

export const LlmNodePanel = ({ node, nodes, edges, onChange }: NodePanelProps) => {
  const [draft, setDraft] = useConfigDraft(node.id, node.data.config, onChange);
  const parsed = LlmNodeConfigSchema.safeParse(draft);
  const config = parsed.success
    ? parsed.data
    : configWithDraft(LlmNodeConfigSchema.parse(llmDefaultConfig), draft);
  return (
    <PanelSection title="本地模型提示词">
      <TemplateEditor
        label="系统提示词"
        value={config.systemPrompt ?? ''}
        nodeId={node.id}
        nodes={nodes}
        edges={edges}
        onChange={(systemPrompt) => setDraft({ ...config, systemPrompt })}
      />
      <TemplateEditor
        label="用户提示词"
        value={config.prompt}
        nodeId={node.id}
        nodes={nodes}
        edges={edges}
        onChange={(prompt) => setDraft({ ...config, prompt })}
      />
      <Input
        aria-label="最大生成 token"
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
