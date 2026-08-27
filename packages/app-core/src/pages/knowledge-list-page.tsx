import type { Dataset } from '@ai-engine/contracts';
import { Button } from '@ai-engine/ui';
import { useState } from 'react';
import { Link } from 'react-router';
import { usePlatform } from '@ai-engine/platform';
import { createKnowledgeListHandlers } from '../knowledge/knowledge-list-actions';

export const KnowledgeDatasetGrid = ({ datasets }: { datasets: Dataset[] }) => (
  <section className="grid gap-3 sm:grid-cols-2">
    {datasets.map((dataset) => (
      <Link
        key={dataset.id}
        to={`/knowledge/${dataset.id}`}
        className="border-border hover:bg-accent rounded-md border p-4"
      >
        <h2 className="text-base">{dataset.name}</h2>
        <p className="text-muted-foreground text-xs">
          文档 {dataset.documentCount} · 切片 {dataset.chunkCount}
        </p>
      </Link>
    ))}
  </section>
);

export const KnowledgeListPage = () => {
  const platform = usePlatform();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [name, setName] = useState('测试知识库');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const handlers = createKnowledgeListHandlers(platform, {
    name,
    setName,
    setDatasets,
    setError,
    setLoading,
  });

  return (
    <main className="bg-background text-foreground flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-lg">知识库</h1>
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={handlers.onRefreshClick}
        >
          {datasets.length > 0 ? '刷新' : '加载知识库'}
        </Button>
      </header>

      <section className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          名称
          <input
            className="border-input bg-background rounded-md border px-3 py-2 text-sm"
            value={name}
            onChange={handlers.onNameChange}
          />
        </label>
        <Button type="button" onClick={handlers.onCreateClick}>
          创建
        </Button>
      </section>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <KnowledgeDatasetGrid datasets={datasets} />
    </main>
  );
};
