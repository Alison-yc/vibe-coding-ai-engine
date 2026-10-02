import { useQuery } from '@tanstack/react-query';
import { usePlatform } from '@ai-engine/platform';
import { Input, Select } from '@ai-engine/ui';
import { KnowledgeRetrievalNodeConfigSchema } from '@ai-engine/contracts';
import { useTranslation } from 'react-i18next';
import { listDatasets } from '../../../knowledge/knowledge-api';
import { TemplateEditor } from '../../template-editor';
import { configWithDraft, PanelSection } from '../common';
import type { NodePanelProps } from '../types';
import { useConfigDraft } from '../use-config-draft';
import { knowledgeRetrievalDefaultConfig } from './default';

export const KnowledgeRetrievalNodePanel = ({ node, nodes, edges, onChange }: NodePanelProps) => {
  const { t } = useTranslation('workflow');
  const platform = usePlatform();
  const datasets = useQuery({
    queryKey: ['knowledge-datasets'],
    queryFn: () => listDatasets(platform),
  });
  const [draft, setDraft] = useConfigDraft(node.id, node.data.config, onChange);
  const parsed = KnowledgeRetrievalNodeConfigSchema.safeParse(draft);
  const config = parsed.success
    ? parsed.data
    : configWithDraft({ ...knowledgeRetrievalDefaultConfig, datasetId: '' }, draft);
  return (
    <PanelSection title={t('panels.knowledgeRetrieval.title')}>
      <Select
        aria-label={t('panels.knowledgeRetrieval.knowledgeBase')}
        value={config.datasetId}
        onChange={(event) => setDraft({ ...config, datasetId: event.target.value })}
      >
        <option value="">{t('panels.knowledgeRetrieval.selectKnowledgeBase')}</option>
        {(datasets.data ?? []).map((dataset) => (
          <option key={dataset.id} value={dataset.id}>
            {dataset.name}
          </option>
        ))}
      </Select>
      <TemplateEditor
        label={t('panels.knowledgeRetrieval.query')}
        value={config.query}
        nodeId={node.id}
        nodes={nodes}
        edges={edges}
        onChange={(query) => setDraft({ ...config, query })}
      />
      <Input
        aria-label="Top K"
        type="number"
        min={1}
        max={20}
        value={config.topK}
        onChange={(event) => setDraft({ ...config, topK: Number(event.target.value) })}
      />
      <Input
        aria-label={t('panels.knowledgeRetrieval.scoreThreshold')}
        type="number"
        min={0}
        max={1}
        step={0.05}
        value={config.scoreThreshold}
        onChange={(event) => setDraft({ ...config, scoreThreshold: Number(event.target.value) })}
      />
    </PanelSection>
  );
};
