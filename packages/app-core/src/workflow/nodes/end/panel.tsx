import { Button, Input } from '@ai-engine/ui';
import { EndNodeConfigSchema } from '@ai-engine/contracts';
import { VariableSelector, variableOptionsForNode } from '../../variable-selector';
import { configWithDraft, PanelSection } from '../common';
import type { NodePanelProps } from '../types';
import { useConfigDraft } from '../use-config-draft';
import { endDefaultConfig } from './default';

export const EndNodePanel = ({ node, nodes, edges, onChange }: NodePanelProps) => {
  const [draft, setDraft] = useConfigDraft(node.id, node.data.config, onChange);
  const parsed = EndNodeConfigSchema.safeParse(draft);
  const outputs = parsed.success
    ? parsed.data.outputs
    : configWithDraft(EndNodeConfigSchema.parse(endDefaultConfig), draft).outputs;
  const fallbackSelector = variableOptionsForNode(node.id, nodes, edges)[0]?.selector ?? [
    'sys',
    'query',
  ];
  const update = (index: number, patch: Record<string, unknown>) =>
    setDraft({
      outputs: outputs.map((output, current) =>
        current === index ? { ...output, ...patch } : output,
      ),
    });
  return (
    <PanelSection title="工作流输出">
      {outputs.map((output, index) => (
        <div className="border-border flex flex-col gap-2 rounded-md border p-3" key={`${index}`}>
          <Input
            aria-label={`输出 ${index + 1} 名称`}
            value={output.name}
            onChange={(event) => update(index, { name: event.target.value })}
          />
          <VariableSelector
            label="来源变量"
            nodeId={node.id}
            nodes={nodes}
            edges={edges}
            value={output.selector}
            onChange={(selector) => update(index, { selector })}
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={outputs.length === 1}
            onClick={() => setDraft({ outputs: outputs.filter((_, current) => current !== index) })}
          >
            删除输出
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          setDraft({
            outputs: [
              ...outputs,
              { name: `output_${outputs.length + 1}`, selector: fallbackSelector },
            ],
          })
        }
      >
        添加输出
      </Button>
    </PanelSection>
  );
};
