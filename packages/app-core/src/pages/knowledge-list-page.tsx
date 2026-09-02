import type { Dataset } from '@ai-engine/contracts';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@ai-engine/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { usePlatform } from '@ai-engine/platform';
import { AppNavLinks, EmptyState, PageShell } from '../components/page-shell';
import { createDataset, deleteDataset, listDatasets } from '../knowledge/knowledge-api';
import { localizeApiError } from '../i18n/localize-api-error';
import { useKnowledgeTranslation } from '../i18n/knowledge-i18n';

export const KnowledgeDatasetGrid = ({
  datasets,
  pendingDeleteId,
  deletingId,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  datasets: Dataset[];
  pendingDeleteId?: string | null;
  deletingId?: string | null;
  onRequestDelete?: (datasetId: string) => void;
  onConfirmDelete?: (datasetId: string) => void;
  onCancelDelete?: () => void;
}) => {
  const t = useKnowledgeTranslation();
  if (datasets.length === 0) {
    return <EmptyState title={t('list.empty.title')} description={t('list.empty.description')} />;
  }
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      {datasets.map((dataset) => (
        <Card key={dataset.id} className="min-w-0">
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Link to={`/knowledge/${dataset.id}`} className="group block min-w-0">
                <CardTitle className="group-hover:text-primary min-w-0 truncate transition-colors">
                  {dataset.name}
                </CardTitle>
              </Link>
              <CardDescription className="flex min-w-0 flex-wrap gap-x-1">
                <span>{t('list.dataset.documentCount', { count: dataset.documentCount })}</span>
                <span aria-hidden="true">·</span>
                <span>{t('list.dataset.chunkCount', { count: dataset.chunkCount })}</span>
              </CardDescription>
            </div>
            {onRequestDelete && onConfirmDelete && onCancelDelete ? (
              pendingDeleteId === dataset.id ? (
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={deletingId === dataset.id}
                    onClick={() => onConfirmDelete(dataset.id)}
                  >
                    {t('list.dataset.confirmDelete')}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={onCancelDelete}>
                    {t('list.dataset.cancelDelete')}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive shrink-0"
                  disabled={Boolean(deletingId)}
                  onClick={() => onRequestDelete(dataset.id)}
                >
                  {t('list.dataset.delete')}
                </Button>
              )
            ) : null}
          </CardHeader>
          <CardContent className="pt-0">
            <Link to={`/knowledge/${dataset.id}`} className="group block min-w-0">
              <p className="text-muted-foreground truncate text-xs">
                {t('list.dataset.openDetails')}
              </p>
            </Link>
          </CardContent>
        </Card>
      ))}
    </section>
  );
};

export const KnowledgeListPage = () => {
  const platform = usePlatform();
  const t = useKnowledgeTranslation();
  const { t: errorT } = useTranslation('errors');
  const [name, setName] = useState(() => t('list.create.defaultName'));
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const datasets = useQuery({
    queryKey: ['knowledge-datasets'],
    queryFn: () => listDatasets(platform),
  });
  const create = useMutation({
    mutationFn: () => createDataset(platform, { name: name.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['knowledge-datasets'] });
    },
  });
  const remove = useMutation({
    mutationFn: (datasetId: string) => deleteDataset(platform, datasetId),
    onSuccess: async () => {
      setPendingDeleteId(null);
      await queryClient.invalidateQueries({ queryKey: ['knowledge-datasets'] });
    },
  });
  const error = datasets.error ?? create.error ?? remove.error;
  const errorFallback = datasets.error
    ? t('errors.load')
    : create.error
      ? t('errors.create')
      : t('errors.delete');

  return (
    <PageShell
      title={t('list.title')}
      description={t('list.description')}
      nav={<AppNavLinks />}
      actions={
        <Button
          type="button"
          variant="outline"
          className="max-w-full min-w-0 truncate"
          disabled={datasets.isFetching}
          onClick={() => void datasets.refetch()}
        >
          {t('list.actions.refresh')}
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="line-clamp-2 min-w-0">{t('list.create.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Label htmlFor="dataset-name">{t('list.create.nameLabel')}</Label>
            <Input
              id="dataset-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Button
            type="button"
            className="max-w-full min-w-0 shrink-0 truncate"
            disabled={create.isPending || name.trim().length === 0}
            onClick={() => create.mutate()}
          >
            {t('list.create.submit')}
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <p className="text-destructive bg-destructive/10 min-w-0 rounded-md px-3 py-2 text-sm break-words">
          {localizeApiError(error, errorT, errorFallback)}
        </p>
      ) : null}

      {datasets.isPending ? (
        <p className="text-muted-foreground text-sm">{t('list.loading')}</p>
      ) : (
        <KnowledgeDatasetGrid
          datasets={datasets.data ?? []}
          pendingDeleteId={pendingDeleteId}
          deletingId={remove.isPending ? remove.variables : null}
          onRequestDelete={setPendingDeleteId}
          onConfirmDelete={(datasetId) => remove.mutate(datasetId)}
          onCancelDelete={() => setPendingDeleteId(null)}
        />
      )}
    </PageShell>
  );
};
