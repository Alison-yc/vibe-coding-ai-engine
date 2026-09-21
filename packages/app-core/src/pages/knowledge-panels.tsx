import type {
  KnowledgeDocument,
  RetrieveHit,
  SplitPreviewChunk,
  DocumentStatus,
} from '@ai-engine/contracts';
import { Badge, Button, Card, CardContent } from '@ai-engine/ui';
import { useKnowledgeTranslation } from '../i18n/knowledge-i18n';

const statusVariant = (
  status: DocumentStatus,
): 'success' | 'destructive' | 'secondary' | 'warning' | 'outline' => {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'destructive';
  if (status === 'pending') return 'secondary';
  if (status === 'indexing' || status === 'embedding' || status === 'splitting') return 'warning';
  return 'outline';
};

export const KnowledgeDocumentList = ({
  documents,
  onRemove,
}: {
  documents: KnowledgeDocument[];
  onRemove: (event: { currentTarget: { getAttribute: (name: string) => string | null } }) => void;
}) => {
  const t = useKnowledgeTranslation();
  if (documents.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('detail.documents.empty')}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {documents.map((document) => (
        <li key={document.id}>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="truncate text-sm font-medium">{document.name}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusVariant(document.status)}>
                    {t(`detail.documents.status.${document.status}`)}
                  </Badge>
                  {document.error ? (
                    <span className="text-destructive line-clamp-2 min-w-0 text-xs break-words">
                      {document.error}
                    </span>
                  ) : null}
                </div>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                data-document-id={document.id}
                onClick={onRemove}
                className="max-w-full min-w-0 truncate"
              >
                {t('detail.documents.remove')}
              </Button>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
};

export const KnowledgePreviewBlocks = ({ chunks }: { chunks: SplitPreviewChunk[] }) => {
  const t = useKnowledgeTranslation();
  return (
    <>
      <p className="text-muted-foreground text-xs">
        {t('detail.preview.chunkCount', { count: chunks.length })}
      </p>
      <pre className="bg-code-bg border-code-border max-h-48 overflow-auto rounded-md border p-3 text-xs">
        {chunks.length === 0
          ? t('detail.preview.empty')
          : chunks
              .map((chunk) => `#${chunk.position} ${chunk.headingPath ?? ''}\n${chunk.content}`)
              .join('\n---\n')}
      </pre>
    </>
  );
};

export const KnowledgeHitsTable = ({ hits }: { hits: RetrieveHit[] }) => {
  const t = useKnowledgeTranslation();
  if (hits.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('detail.retrieve.empty')}</p>;
  }
  return (
    <div className="overflow-auto rounded-lg border">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="text-muted-foreground px-3 py-2 font-medium">
              {t('detail.retrieve.table.source')}
            </th>
            <th className="text-muted-foreground px-3 py-2 font-medium">
              {t('detail.retrieve.table.score')}
            </th>
            <th className="text-muted-foreground px-3 py-2 font-medium">
              {t('detail.retrieve.table.content')}
            </th>
          </tr>
        </thead>
        <tbody>
          {hits.map((hit) => (
            <tr key={hit.chunkId} className="border-t">
              <td className="px-3 py-2 align-top">{hit.documentName}</td>
              <td className="px-3 py-2 align-top font-mono text-xs">{hit.score.toFixed(3)}</td>
              <td className="text-muted-foreground px-3 py-2 align-top text-xs whitespace-pre-wrap">
                {hit.content}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
