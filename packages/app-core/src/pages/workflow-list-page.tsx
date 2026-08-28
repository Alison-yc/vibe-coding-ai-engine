import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { usePlatform } from '@ai-engine/platform';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ai-engine/ui';
import type { WorkflowGraph } from '@ai-engine/contracts';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { AppNavLinks, EmptyState, PageShell } from '../components/page-shell';
import { createWorkflow, deleteWorkflow, listWorkflows } from '../workflow/workflow-api';
import { localizeApiError } from '../i18n/localize-api-error';

const initialGraph = (t: TFunction<'workflow'>): WorkflowGraph => ({
  nodes: [
    {
      id: 'start',
      type: 'custom-node',
      position: { x: 80, y: 160 },
      data: {
        type: 'start',
        title: t('nodes.start.title'),
        config: { fields: [{ name: 'query', type: 'string', required: true }] },
      },
    },
    {
      id: 'end',
      type: 'custom-node',
      position: { x: 440, y: 160 },
      data: {
        type: 'end',
        title: t('nodes.end.title'),
        config: { outputs: [{ name: 'result', selector: ['start', 'query'] }] },
      },
    },
  ],
  edges: [{ id: 'edge_start_end', source: 'start', target: 'end' }],
  viewport: { x: 0, y: 0, zoom: 1 },
});

export const WorkflowListPage = () => {
  const { t, i18n } = useTranslation('workflow');
  const { t: errorT } = useTranslation('errors');
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
        name: t('list.defaultName', {
          date: new Intl.DateTimeFormat(i18n.language, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date()),
        }),
        graph: initialGraph(t),
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
      title={t('list.title')}
      description={t('list.description')}
      nav={<AppNavLinks />}
      actions={
        <Button disabled={create.isPending} onClick={() => create.mutate()}>
          {t('list.create')}
        </Button>
      }
    >
      {workflows.error || create.error || remove.error ? (
        <p className="text-destructive text-sm">
          {localizeApiError(
            workflows.error ?? create.error ?? remove.error,
            errorT,
            t('list.loadFailed'),
          )}
        </p>
      ) : null}
      {!workflows.isPending && (workflows.data?.length ?? 0) === 0 ? (
        <EmptyState
          title={t('list.emptyTitle')}
          description={t('list.emptyDescription')}
          action={<Button onClick={() => create.mutate()}>{t('list.create')}</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(workflows.data ?? []).map((workflow) => (
            <Card key={workflow.id}>
              <CardHeader>
                <CardTitle className="truncate">{workflow.name}</CardTitle>
                <CardDescription>
                  {t('list.version', { version: workflow.version })}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button onClick={() => void navigate(`/workflow/${workflow.id}`)}>
                  {t('list.edit')}
                </Button>
                <Button variant="outline" onClick={() => remove.mutate(workflow.id)}>
                  {t('list.delete')}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
};
