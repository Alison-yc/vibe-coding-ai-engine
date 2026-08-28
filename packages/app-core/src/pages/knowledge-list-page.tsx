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
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { usePlatform } from '@ai-engine/platform';
import { AppNavLinks, EmptyState, PageShell } from '../components/page-shell';
import { createKnowledgeListHandlers } from '../knowledge/knowledge-list-actions';
import { localizeApiError } from '../i18n/localize-api-error';
import { useKnowledgeTranslation } from '../i18n/knowledge-i18n';

export const KnowledgeDatasetGrid = ({ datasets }: { datasets: Dataset[] }) => {
  const t = useKnowledgeTranslation();
  if (datasets.length === 0) {
    return <EmptyState title={t('list.empty.title')} description={t('list.empty.description')} />;
  }
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      {datasets.map((dataset) => (
        <Link key={dataset.id} to={`/knowledge/${dataset.id}`} className="group block min-w-0">
          <Card className="group-hover:bg-accent/40 transition-colors">
            <CardHeader>
              <CardTitle className="group-hover:text-primary min-w-0 truncate transition-colors">
                {dataset.name}
              </CardTitle>
              <CardDescription className="flex min-w-0 flex-wrap gap-x-1">
                <span>{t('list.dataset.documentCount', { count: dataset.documentCount })}</span>
                <span aria-hidden="true">·</span>
                <span>{t('list.dataset.chunkCount', { count: dataset.chunkCount })}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-muted-foreground truncate text-xs">
                {t('list.dataset.openDetails')}
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </section>
  );
};

export const KnowledgeListPage = () => {
  const platform = usePlatform();
  const t = useKnowledgeTranslation();
  const { t: errorT } = useTranslation('errors');
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [name, setName] = useState(() => t('list.create.defaultName'));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const handlers = createKnowledgeListHandlers(platform, {
    name,
    setName,
    setDatasets,
    setError,
    setLoading,
    loadErrorFallback: t('errors.load'),
    createErrorFallback: t('errors.create'),
    formatError: (cause, fallback) => localizeApiError(cause, errorT, fallback),
  });

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
          disabled={loading}
          onClick={handlers.onRefreshClick}
        >
          {datasets.length > 0 ? t('list.actions.refresh') : t('list.actions.load')}
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
            <Input id="dataset-name" value={name} onChange={handlers.onNameChange} />
          </div>
          <Button
            type="button"
            className="max-w-full min-w-0 shrink-0 truncate"
            onClick={handlers.onCreateClick}
          >
            {t('list.create.submit')}
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <p className="text-destructive bg-destructive/10 min-w-0 rounded-md px-3 py-2 text-sm break-words">
          {error}
        </p>
      ) : null}

      <KnowledgeDatasetGrid datasets={datasets} />
    </PageShell>
  );
};
