import { useState } from 'react';
import { Select, Textarea } from '@ai-engine/ui';
import { HttpRequestNodeConfigSchema } from '@ai-engine/contracts';
import { TemplateEditor } from '../../template-editor';
import { configWithDraft, PanelSection } from '../common';
import type { NodePanelProps } from '../types';
import { useConfigDraft } from '../use-config-draft';
import { httpRequestDefaultConfig } from './default';

export const HttpRequestNodePanel = ({ node, nodes, edges, onChange }: NodePanelProps) => {
  const [draft, setDraft] = useConfigDraft(node.id, node.data.config, onChange);
  const parsed = HttpRequestNodeConfigSchema.safeParse(draft);
  const config = parsed.success
    ? parsed.data
    : configWithDraft(HttpRequestNodeConfigSchema.parse(httpRequestDefaultConfig), draft);
  const [headersText, setHeadersText] = useState(() => JSON.stringify(config.headers, null, 2));
  const [headersError, setHeadersError] = useState('');
  return (
    <PanelSection title="HTTP 请求" description="仅允许访问公网 HTTP(S) 地址">
      <Select
        aria-label="请求方法"
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
        <span className="text-xs font-medium">请求头 JSON</span>
        <Textarea
          aria-label="请求头 JSON"
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
              setHeadersError('请求头必须是字符串键值对象');
            }
          }}
        />
        {headersError ? <span className="text-destructive text-xs">{headersError}</span> : null}
      </div>
      {config.method !== 'GET' ? (
        <TemplateEditor
          label="请求体"
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
