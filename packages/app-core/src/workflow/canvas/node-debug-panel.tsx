import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { usePlatform } from '@ai-engine/platform';
import { Button, Textarea } from '@ai-engine/ui';
import { RunNodeRequestSchema, type RunNodeRequest } from '@ai-engine/contracts';
import { useWorkflowStore } from '../store/workflow-store';
import { runWorkflowNode } from '../workflow-api';

export const NodeDebugPanel = ({
  workflowId,
  nodeId,
  beforeRun,
}: {
  workflowId: string;
  nodeId: string;
  beforeRun: () => Promise<void>;
}) => {
  const platform = usePlatform();
  const [values, setValues] = useState('{\n  "sys": {\n    "query": ""\n  }\n}');
  const [parseError, setParseError] = useState('');
  const mutation = useMutation({
    mutationFn: async (request: RunNodeRequest) => {
      await beforeRun();
      const config = useWorkflowStore.getState().nodes.find((node) => node.id === nodeId)
        ?.data.config;
      return runWorkflowNode(platform, workflowId, nodeId, { ...request, configOverride: config });
    },
  });
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">单节点调试</h3>
        <p className="text-muted-foreground text-xs">填写上游变量快照后独立执行当前节点</p>
      </div>
      <Textarea
        aria-label="调试上游变量 JSON"
        className="min-h-28 font-mono text-xs"
        value={values}
        onChange={(event) => setValues(event.target.value)}
      />
      <Button
        size="sm"
        disabled={mutation.isPending}
        onClick={() => {
          try {
            const parsed: unknown = JSON.parse(values);
            const request = RunNodeRequestSchema.parse({ upstreamValues: parsed });
            setParseError('');
            mutation.mutate(request);
          } catch (error) {
            setParseError(error instanceof Error ? error.message : 'JSON 不合法');
          }
        }}
      >
        {mutation.isPending ? '调试中…' : '运行当前节点'}
      </Button>
      {parseError || mutation.error ? (
        <p className="text-destructive text-xs">
          {parseError || (mutation.error instanceof Error ? mutation.error.message : '调试失败')}
        </p>
      ) : null}
      {mutation.data ? (
        <pre className="bg-muted max-h-40 overflow-auto rounded p-2 text-xs">
          {JSON.stringify(mutation.data.outputs, null, 2)}
        </pre>
      ) : null}
    </section>
  );
};
