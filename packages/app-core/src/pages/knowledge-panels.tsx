import type {
  KnowledgeDocument,
  RetrieveHit,
  SplitPreviewChunk,
  DocumentStatus,
} from '@ai-engine/contracts';
import { Badge, Button, Card, CardContent } from '@ai-engine/ui';

const statusVariant = (
  status: DocumentStatus,
): 'success' | 'destructive' | 'secondary' | 'warning' | 'outline' => {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'destructive';
  if (status === 'pending') return 'secondary';
  if (status === 'indexing' || status === 'embedding' || status === 'splitting') return 'warning';
  return 'outline';
};

const statusLabel: Record<DocumentStatus, string> = {
  pending: '等待索引',
  extracting: '提取中',
  cleaning: '清洗中',
  splitting: '切分中',
  embedding: '向量化',
  indexing: '写入索引',
  completed: '已完成',
  failed: '失败',
};

export const KnowledgeDocumentList = ({
  documents,
  onRemove,
}: {
  documents: KnowledgeDocument[];
  onRemove: (event: { currentTarget: { getAttribute: (name: string) => string | null } }) => void;
}) => {
  if (documents.length === 0) {
    return <p className="text-muted-foreground text-sm">还没有文档，请上传或粘贴内容。</p>;
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
                    {statusLabel[document.status]}
                  </Badge>
                  {document.error ? (
                    <span className="text-destructive text-xs">{document.error}</span>
                  ) : null}
                </div>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                data-document-id={document.id}
                onClick={onRemove}
              >
                删除
              </Button>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
};

export const KnowledgePreviewBlocks = ({ chunks }: { chunks: SplitPreviewChunk[] }) => (
  <>
    <p className="text-muted-foreground text-xs">{chunks.length} 个切片</p>
    <pre className="bg-code-bg border-code-border max-h-48 overflow-auto rounded-md border p-3 text-xs">
      {chunks.length === 0
        ? '点击「预览切分」查看结果'
        : chunks
            .map((chunk) => `#${chunk.position} ${chunk.headingPath ?? ''}\n${chunk.content}`)
            .join('\n---\n')}
    </pre>
  </>
);

export const KnowledgeHitsTable = ({ hits }: { hits: RetrieveHit[] }) => {
  if (hits.length === 0) {
    return <p className="text-muted-foreground text-sm">还没有检索结果。</p>;
  }
  return (
    <div className="overflow-auto rounded-lg border">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="text-muted-foreground px-3 py-2 font-medium">来源</th>
            <th className="text-muted-foreground px-3 py-2 font-medium">分数</th>
            <th className="text-muted-foreground px-3 py-2 font-medium">内容</th>
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
