import type { KnowledgeDocument, RetrieveHit, SplitPreviewChunk } from '@ai-engine/contracts';
import { Button } from '@ai-engine/ui';

export const KnowledgeDocumentList = ({
  documents,
  onRemove,
}: {
  documents: KnowledgeDocument[];
  onRemove: (event: { currentTarget: { getAttribute: (name: string) => string | null } }) => void;
}) => (
  <ul className="flex flex-col gap-2 text-sm">
    {documents.map((document) => (
      <li key={document.id} className="border-border flex items-center justify-between border p-2">
        <span>
          {document.name} · {document.status}
          {document.error ? ` · ${document.error}` : ''}
        </span>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          data-document-id={document.id}
          onClick={onRemove}
        >
          删除
        </Button>
      </li>
    ))}
  </ul>
);

export const KnowledgePreviewBlocks = ({ chunks }: { chunks: SplitPreviewChunk[] }) => (
  <>
    <p className="text-muted-foreground text-xs">{chunks.length} 个切片</p>
    <pre className="bg-muted max-h-48 overflow-auto rounded-md p-3 text-xs">
      {chunks
        .map((chunk) => `#${chunk.position} ${chunk.headingPath ?? ''}\n${chunk.content}`)
        .join('\n---\n')}
    </pre>
  </>
);

export const KnowledgeHitsTable = ({ hits }: { hits: RetrieveHit[] }) => (
  <table className="min-w-full text-left text-xs">
    <thead>
      <tr>
        <th className="px-2 py-1">来源</th>
        <th className="px-2 py-1">分数</th>
        <th className="px-2 py-1">内容</th>
      </tr>
    </thead>
    <tbody>
      {hits.map((hit) => (
        <tr key={hit.chunkId} className="border-t">
          <td className="px-2 py-1">{hit.documentName}</td>
          <td className="px-2 py-1">{hit.score.toFixed(3)}</td>
          <td className="px-2 py-1">{hit.content}</td>
        </tr>
      ))}
    </tbody>
  </table>
);
