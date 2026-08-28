import {
  DEFAULT_CHUNK_CONFIG,
  type ChunkConfig,
  type Dataset,
  type KnowledgeDocument,
  type RetrieveHit,
  type SplitPreviewChunk,
} from '@ai-engine/contracts';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FileInput,
  Input,
  Label,
  Select,
  Textarea,
} from '@ai-engine/ui';
import { useState } from 'react';
import { useParams } from 'react-router';
import { usePlatform } from '@ai-engine/platform';
import { AppNavLinks, PageShell } from '../components/page-shell';
import { createKnowledgeDetailHandlers } from '../knowledge/knowledge-detail-actions';
import {
  KnowledgeDocumentList,
  KnowledgeHitsTable,
  KnowledgePreviewBlocks,
} from './knowledge-panels';

export const KnowledgeDetailPage = () => {
  const platform = usePlatform();
  const { id } = useParams();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [pasteName, setPasteName] = useState('notes.md');
  const [pasteText, setPasteText] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [chunkSize, setChunkSize] = useState(DEFAULT_CHUNK_CONFIG.chunkSize);
  const [overlap, setOverlap] = useState(DEFAULT_CHUNK_CONFIG.overlap);
  const [strategy, setStrategy] = useState<ChunkConfig['strategy']>(DEFAULT_CHUNK_CONFIG.strategy);
  const [previewChunks, setPreviewChunks] = useState<SplitPreviewChunk[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<RetrieveHit[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chunkConfig: ChunkConfig = { strategy, chunkSize, overlap };

  if (!id) {
    return (
      <PageShell title="知识库详情" nav={<AppNavLinks />}>
        <p className="text-destructive text-sm">缺少知识库 id</p>
      </PageShell>
    );
  }

  const handlers = createKnowledgeDetailHandlers(platform, id, {
    pasteName,
    pasteText,
    previewText,
    query,
    chunkConfig,
    setDataset,
    setDocuments,
    setPasteName,
    setPasteText,
    setPreviewText,
    setChunkSize,
    setOverlap,
    setStrategy,
    setPreviewChunks,
    setQuery,
    setHits,
    setAnswer,
    setError,
  });

  return (
    <PageShell
      title={dataset?.name ?? '知识库详情'}
      description="上传文档、预览切分，并在不经过 LLM 的情况下测试检索。"
      backTo="/knowledge"
      backLabel="知识库列表"
      nav={<AppNavLinks />}
      actions={
        <Button type="button" variant="outline" onClick={handlers.onRefreshClick}>
          刷新
        </Button>
      }
    >
      {error ? (
        <p className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm">{error}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>粘贴文本</CardTitle>
          <CardDescription>直接粘贴 Markdown 或纯文本，立即进入索引流水线。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="paste-name">文件名</Label>
            <Input id="paste-name" value={pasteName} onChange={handlers.onPasteNameChange} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="paste-text">内容</Label>
            <Textarea
              id="paste-text"
              className="min-h-32"
              value={pasteText}
              onChange={handlers.onPasteTextChange}
              placeholder="粘贴要索引的文本…"
            />
          </div>
          <Button type="button" className="self-start" onClick={handlers.onPasteClick}>
            索引粘贴内容
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>上传文档</CardTitle>
          <CardDescription>支持 txt、md、pdf。上传后自动进入五阶段索引。</CardDescription>
        </CardHeader>
        <CardContent>
          <FileInput
            accept=".txt,.md,.pdf"
            onChange={handlers.onUploadChange}
            buttonLabel="上传文件"
            emptyHint="未选择文件"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>文档列表</CardTitle>
        </CardHeader>
        <CardContent>
          <KnowledgeDocumentList documents={documents} onRemove={handlers.onRemoveClick} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>切分预览</CardTitle>
          <CardDescription>调整策略与参数，预览切片结果后再上传正式文档。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Textarea
            value={previewText}
            onChange={handlers.onPreviewTextChange}
            placeholder="输入一段文本用于预览切分…"
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="chunk-strategy">策略</Label>
              <Select id="chunk-strategy" value={strategy} onChange={handlers.onStrategyChange}>
                <option value="recursive">recursive</option>
                <option value="fixed">fixed</option>
                <option value="markdown">markdown</option>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="chunk-size">chunkSize</Label>
              <Input
                id="chunk-size"
                type="number"
                value={chunkSize}
                onChange={handlers.onChunkSizeChange}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="chunk-overlap">overlap</Label>
              <Input
                id="chunk-overlap"
                type="number"
                value={overlap}
                onChange={handlers.onOverlapChange}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handlers.onPreviewClick}
              >
                预览切分
              </Button>
            </div>
          </div>
          <KnowledgePreviewBlocks chunks={previewChunks} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>检索测试</CardTitle>
          <CardDescription>只走向量检索，不调用 LLM。用于排查召回问题。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="retrieve-query">查询</Label>
            <Input
              id="retrieve-query"
              value={query}
              onChange={handlers.onQueryChange}
              placeholder="输入要检索的问题…"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handlers.onRetrieveClick}>
              检索
            </Button>
            <Button type="button" variant="secondary" onClick={handlers.onAnswerClick}>
              试答
            </Button>
          </div>
          {answer ? (
            <div className="bg-muted/50 rounded-md border px-4 py-3 text-sm whitespace-pre-wrap">
              {answer}
            </div>
          ) : null}
          <KnowledgeHitsTable hits={hits} />
        </CardContent>
      </Card>
    </PageShell>
  );
};
