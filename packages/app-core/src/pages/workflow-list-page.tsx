import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { usePlatform } from '@ai-engine/platform';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ai-engine/ui';
import type { WorkflowGraph } from '@ai-engine/contracts';
import { AppNavLinks, EmptyState, PageShell } from '../components/page-shell';
import { createWorkflow, deleteWorkflow, listWorkflows } from '../workflow/workflow-api';

const initialGraph = (): WorkflowGraph => ({
  nodes: [
    {
      id: 'start',
      type: 'custom-node',
      position: { x: 80, y: 160 },
      data: {
        type: 'start',
        title: '开始',
        config: { fields: [{ name: 'query', type: 'string', required: true }] },
      },
    },
    {
      id: 'end',
      type: 'custom-node',
      position: { x: 440, y: 160 },
      data: {
        type: 'end',
        title: '结束',
        config: { outputs: [{ name: 'result', selector: ['start', 'query'] }] },
      },
    },
  ],
  edges: [{ id: 'edge_start_end', source: 'start', target: 'end' }],
  viewport: { x: 0, y: 0, zoom: 1 },
});

export const WorkflowListPage = () => {
  const platform = usePlatform();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workflows = useQuery({
    queryKey: ['workflows'],
    queryFn: () => listWorkflows(platform),
  });
  const create = useMutation({
    mutationFn: () =>
      createWorkflow(platform, {
        name: `工作流 ${new Date().toLocaleString('zh-CN')}`,
        graph: initialGraph(),
      }),
    onSuccess: async (workflow) => {
      await queryClient.invalidateQueries({ queryKey: ['workflows'] });
      void navigate(`/workflow/${workflow.id}`);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteWorkflow(platform, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflows'] }),
  });
  return (
    <PageShell
      title="工作流"
      description="拖拽节点编排本地 AI 流程"
      nav={<AppNavLinks />}
      actions={
        <Button disabled={create.isPending} onClick={() => create.mutate()}>
          新建工作流
        </Button>
      }
    >
      {workflows.error ? (
        <p className="text-destructive text-sm">
          {workflows.error instanceof Error ? workflows.error.message : '加载失败'}
        </p>
      ) : null}
      {!workflows.isPending && (workflows.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="还没有工作流"
          description="新建一个工作流，从开始节点连接到结束节点。"
          action={<Button onClick={() => create.mutate()}>新建工作流</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(workflows.data ?? []).map((workflow) => (
            <Card key={workflow.id}>
              <CardHeader>
                <CardTitle>{workflow.name}</CardTitle>
                <CardDescription>版本 {workflow.version}</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button onClick={() => void navigate(`/workflow/${workflow.id}`)}>编辑</Button>
                <Button variant="outline" onClick={() => remove.mutate(workflow.id)}>
                  删除
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
};
