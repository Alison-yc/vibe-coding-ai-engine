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
import { useKnowledgeTranslation } from '../i18n/knowledge-i18n';
import {
  KnowledgeDocumentList,
  KnowledgeHitsTable,
  KnowledgePreviewBlocks,
} from './knowledge-panels';

export const KnowledgeDetailPage = () => {
  const platform = usePlatform();
  const t = useKnowledgeTranslation();
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
      <PageShell title={t('detail.fallbackTitle')} nav={<AppNavLinks />}>
        <p className="text-destructive text-sm">{t('detail.missingId')}</p>
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
    indexErrorFallback: t('errors.index'),
    uploadErrorFallback: t('errors.upload'),
  });

  return (
    <PageShell
      title={dataset?.name ?? t('detail.fallbackTitle')}
      description={t('detail.description')}
      backTo="/knowledge"
      backLabel={t('detail.backToList')}
      nav={<AppNavLinks />}
      actions={
        <Button
          type="button"
          variant="outline"
          className="max-w-full min-w-0 truncate"
          onClick={handlers.onRefreshClick}
        >
          {t('detail.refresh')}
        </Button>
      }
    >
      {error ? (
        <p className="text-destructive bg-destructive/10 min-w-0 rounded-md px-3 py-2 text-sm break-words">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="line-clamp-2 min-w-0">{t('detail.paste.title')}</CardTitle>
          <CardDescription className="line-clamp-3 min-w-0">
            {t('detail.paste.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="paste-name">{t('detail.paste.fileNameLabel')}</Label>
            <Input id="paste-name" value={pasteName} onChange={handlers.onPasteNameChange} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="paste-text">{t('detail.paste.contentLabel')}</Label>
            <Textarea
              id="paste-text"
              className="min-h-32"
              value={pasteText}
              onChange={handlers.onPasteTextChange}
              placeholder={t('detail.paste.contentPlaceholder')}
            />
          </div>
          <Button
            type="button"
            className="max-w-full min-w-0 self-start truncate"
            onClick={handlers.onPasteClick}
          >
            {t('detail.paste.submit')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="line-clamp-2 min-w-0">{t('detail.upload.title')}</CardTitle>
          <CardDescription className="line-clamp-3 min-w-0">
            {t('detail.upload.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileInput
            accept=".txt,.md,.pdf"
            onChange={handlers.onUploadChange}
            buttonLabel={t('detail.upload.button')}
            emptyHint={t('detail.upload.emptyHint')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="line-clamp-2 min-w-0">{t('detail.documents.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <KnowledgeDocumentList documents={documents} onRemove={handlers.onRemoveClick} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="line-clamp-2 min-w-0">{t('detail.preview.title')}</CardTitle>
          <CardDescription className="line-clamp-3 min-w-0">
            {t('detail.preview.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Textarea
            value={previewText}
            onChange={handlers.onPreviewTextChange}
            placeholder={t('detail.preview.textPlaceholder')}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="chunk-strategy">{t('detail.preview.strategyLabel')}</Label>
              <Select id="chunk-strategy" value={strategy} onChange={handlers.onStrategyChange}>
                <option value="recursive">recursive</option>
                <option value="fixed">fixed</option>
                <option value="markdown">markdown</option>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="chunk-size">{t('detail.preview.chunkSizeLabel')}</Label>
              <Input
                id="chunk-size"
                type="number"
                value={chunkSize}
                onChange={handlers.onChunkSizeChange}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="chunk-overlap">{t('detail.preview.overlapLabel')}</Label>
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
                className="w-full max-w-full min-w-0 truncate"
                onClick={handlers.onPreviewClick}
              >
                {t('detail.preview.submit')}
              </Button>
            </div>
          </div>
          <KnowledgePreviewBlocks chunks={previewChunks} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="line-clamp-2 min-w-0">{t('detail.retrieve.title')}</CardTitle>
          <CardDescription className="line-clamp-3 min-w-0">
            {t('detail.retrieve.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="retrieve-query">{t('detail.retrieve.queryLabel')}</Label>
            <Input
              id="retrieve-query"
              value={query}
              onChange={handlers.onQueryChange}
              placeholder={t('detail.retrieve.queryPlaceholder')}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="max-w-full min-w-0 truncate"
              onClick={handlers.onRetrieveClick}
            >
              {t('detail.retrieve.submit')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="max-w-full min-w-0 truncate"
              onClick={handlers.onAnswerClick}
            >
              {t('detail.retrieve.answer')}
            </Button>
          </div>
          {answer ? (
            <div className="bg-muted/50 min-w-0 rounded-md border px-4 py-3 text-sm break-words whitespace-pre-wrap">
              {answer}
            </div>
          ) : null}
          <KnowledgeHitsTable hits={hits} />
        </CardContent>
      </Card>
    </PageShell>
  );
};
