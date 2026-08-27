import {
  DEFAULT_CHUNK_CONFIG,
  type ChunkConfig,
  type Dataset,
  type KnowledgeDocument,
  type RetrieveHit,
  type SplitPreviewChunk,
} from '@ai-engine/contracts';
import { Button } from '@ai-engine/ui';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { usePlatform } from '@ai-engine/platform';
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
      <main className="p-6">
        <p>缺少知识库 id</p>
      </main>
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
    <main className="bg-background text-foreground flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <Link to="/knowledge" className="text-muted-foreground text-sm">
            返回列表
          </Link>
          <h1 className="text-lg">{dataset?.name ?? '知识库详情'}</h1>
        </div>
        <Button type="button" variant="outline" onClick={handlers.onRefreshClick}>
          加载详情
        </Button>
      </header>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-base">粘贴文本</h2>
        <input
          className="border-input rounded-md border px-3 py-2 text-sm"
          value={pasteName}
          onChange={handlers.onPasteNameChange}
        />
        <textarea
          className="border-input min-h-32 rounded-md border px-3 py-2 text-sm"
          value={pasteText}
          onChange={handlers.onPasteTextChange}
        />
        <Button type="button" onClick={handlers.onPasteClick}>
          索引粘贴内容
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base">上传 txt / md / pdf</h2>
        <input type="file" accept=".txt,.md,.pdf" onChange={handlers.onUploadChange} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base">文档</h2>
        <KnowledgeDocumentList documents={documents} onRemove={handlers.onRemoveClick} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base">切分预览</h2>
        <textarea
          className="border-input min-h-24 rounded-md border px-3 py-2 text-sm"
          value={previewText}
          onChange={handlers.onPreviewTextChange}
        />
        <div className="flex flex-wrap gap-2 text-sm">
          <label>
            策略
            <select
              className="border-input ml-2 rounded-md border px-2 py-1"
              value={strategy}
              onChange={handlers.onStrategyChange}
            >
              <option value="recursive">recursive</option>
              <option value="fixed">fixed</option>
              <option value="markdown">markdown</option>
            </select>
          </label>
          <label>
            chunkSize
            <input
              className="border-input ml-2 w-20 rounded-md border px-2 py-1"
              type="number"
              value={chunkSize}
              onChange={handlers.onChunkSizeChange}
            />
          </label>
          <label>
            overlap
            <input
              className="border-input ml-2 w-20 rounded-md border px-2 py-1"
              type="number"
              value={overlap}
              onChange={handlers.onOverlapChange}
            />
          </label>
          <Button type="button" variant="outline" onClick={handlers.onPreviewClick}>
            预览切分
          </Button>
        </div>
        <KnowledgePreviewBlocks chunks={previewChunks} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base">检索测试（不经过 LLM）</h2>
        <input
          className="border-input rounded-md border px-3 py-2 text-sm"
          value={query}
          onChange={handlers.onQueryChange}
        />
        <div className="flex gap-2">
          <Button type="button" onClick={handlers.onRetrieveClick}>
            检索
          </Button>
          <Button type="button" variant="outline" onClick={handlers.onAnswerClick}>
            试答
          </Button>
        </div>
        {answer ? <p className="text-sm">{answer}</p> : null}
        <KnowledgeHitsTable hits={hits} />
      </section>
    </main>
  );
};
