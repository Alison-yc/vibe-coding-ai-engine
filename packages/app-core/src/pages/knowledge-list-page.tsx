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
import { Link } from 'react-router';
import { usePlatform } from '@ai-engine/platform';
import { AppNavLinks, EmptyState, PageShell } from '../components/page-shell';
import { createKnowledgeListHandlers } from '../knowledge/knowledge-list-actions';

export const KnowledgeDatasetGrid = ({ datasets }: { datasets: Dataset[] }) => {
  if (datasets.length === 0) {
    return (
      <EmptyState
        title="还没有知识库"
        description="创建一个知识库，然后上传 txt、md 或 pdf 文档开始索引。"
      />
    );
  }
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      {datasets.map((dataset) => (
        <Link key={dataset.id} to={`/knowledge/${dataset.id}`} className="group block">
          <Card className="group-hover:bg-accent/40 transition-colors">
            <CardHeader>
              <CardTitle className="group-hover:text-primary transition-colors">
                {dataset.name}
              </CardTitle>
              <CardDescription>
                文档 {dataset.documentCount} · 切片 {dataset.chunkCount}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-muted-foreground text-xs">点击进入详情 →</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </section>
  );
};

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
    <PageShell
      title="知识库"
      description="管理文档索引，并在详情页测试检索与试答。"
      nav={<AppNavLinks />}
      actions={
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={handlers.onRefreshClick}
        >
          {datasets.length > 0 ? '刷新' : '加载知识库'}
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>新建知识库</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Label htmlFor="dataset-name">名称</Label>
            <Input id="dataset-name" value={name} onChange={handlers.onNameChange} />
          </div>
          <Button type="button" className="shrink-0" onClick={handlers.onCreateClick}>
            创建
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <p className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm">{error}</p>
      ) : null}

      <KnowledgeDatasetGrid datasets={datasets} />
    </PageShell>
  );
};
