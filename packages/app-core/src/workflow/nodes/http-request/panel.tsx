import { useState } from 'react';
import { Select, Textarea } from '@ai-engine/ui';
import { HttpRequestNodeConfigSchema } from '@ai-engine/contracts';
import { useTranslation } from 'react-i18next';
import { TemplateEditor } from '../../template-editor';
import { configWithDraft, PanelSection } from '../common';
import type { NodePanelProps } from '../types';
import { useConfigDraft } from '../use-config-draft';
import { httpRequestDefaultConfig } from './default';

export const HttpRequestNodePanel = ({ node, nodes, edges, onChange }: NodePanelProps) => {
  const { t } = useTranslation('workflow');
  const [draft, setDraft] = useConfigDraft(node.id, node.data.config, onChange);
  const parsed = HttpRequestNodeConfigSchema.safeParse(draft);
  const config = parsed.success
    ? parsed.data
    : configWithDraft(HttpRequestNodeConfigSchema.parse(httpRequestDefaultConfig), draft);
  const [headersText, setHeadersText] = useState(() => JSON.stringify(config.headers, null, 2));
  const [headersError, setHeadersError] = useState('');
  return (
    <PanelSection
      title={t('panels.httpRequest.title')}
      description={t('panels.httpRequest.description')}
    >
      <Select
        aria-label={t('panels.httpRequest.method')}
        value={config.method}
        onChange={(event) => setDraft({ ...config, method: event.target.value })}
      >
        {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => (
          <option key={method} value={method}>
            {method}
          </option>
        ))}
      </Select>
      <TemplateEditor
        label="URL"
        value={config.url}
        nodeId={node.id}
        nodes={nodes}
        edges={edges}
        onChange={(url) => setDraft({ ...config, url })}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">{t('panels.httpRequest.headers')}</span>
        <Textarea
          aria-label={t('panels.httpRequest.headers')}
          className="font-mono text-xs"
          value={headersText}
          onChange={(event) => {
            const text = event.target.value;
            setHeadersText(text);
            try {
              const value: unknown = JSON.parse(text);
              const headers = HttpRequestNodeConfigSchema.shape.headers.parse(value);
              setHeadersError('');
              setDraft({ ...config, headers });
            } catch {
              setHeadersError(t('panels.httpRequest.invalidHeaders'));
            }
          }}
        />
        {headersError ? <span className="text-destructive text-xs">{headersError}</span> : null}
      </div>
      {config.method !== 'GET' ? (
        <TemplateEditor
          label={t('panels.httpRequest.body')}
          value={config.body ?? ''}
          nodeId={node.id}
          nodes={nodes}
          edges={edges}
          onChange={(body) => setDraft({ ...config, body })}
        />
      ) : null}
    </PanelSection>
  );
};
