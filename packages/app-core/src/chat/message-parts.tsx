import type { CitationChunk, MessagePart } from '@ai-engine/contracts';
import { type ReactNode, useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

export const closeOpenFence = (text: string): string => {
  const fenceCount = (text.match(/```/g) ?? []).length;
  return fenceCount % 2 === 1 ? `${text}\n\`\`\`` : text;
};

const markdownComponents: Components = {
  table: ({ children, ...props }) => (
    <div className="border-border my-4 w-full overflow-x-auto rounded-lg border">
      <table {...props} className="w-full border-collapse text-sm">
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }) => (
    <th
      {...props}
      className="bg-muted/60 border-border border-b px-3 py-2 text-left align-top font-medium"
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td {...props} className="border-border border-t px-3 py-2 align-top break-words">
      {children}
    </td>
  ),
};

export const StreamMarkdown = ({ text }: { text: string }) => {
  const source = useMemo(() => closeOpenFence(text), [text]);
  return (
    <div className="text-foreground [&_a]:text-primary [&_blockquote]:border-border [&_blockquote]:text-muted-foreground [&_code]:bg-code-bg [&_pre]:border-code-border [&_pre]:bg-code-bg max-w-full min-w-0 text-sm leading-7 break-words [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_pre]:my-4 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={markdownComponents}
      >
        {source}
      </Markdown>
    </div>
  );
};

export const ReasoningBlock = ({ text }: { text: string }) => (
  <details className="border-border rounded-md border p-2 text-sm">
    <summary className="text-muted-foreground cursor-pointer">思考过程</summary>
    <p className="mt-2 whitespace-pre-wrap">{text}</p>
  </details>
);

export const ToolCard = ({
  name,
  state,
  output,
  error,
}: {
  name: string;
  state: string;
  output?: string;
  error?: string;
}): ReactNode => (
  <article className="border-border bg-card rounded-md border p-3 text-sm">
    <p>
      工具 {name} · {state}
    </p>
    {output ? <p className="text-muted-foreground mt-1">{output}</p> : null}
    {error ? <p className="text-destructive mt-1">{error}</p> : null}
  </article>
);

export const CitationList = ({ chunks }: { chunks: CitationChunk[] }) => (
  <ul className="flex min-w-0 flex-col gap-2">
    {chunks.map((chunk, index) => (
      <li key={chunk.chunkId}>
        <details className="bg-citation-bg/70 border-citation-border rounded-lg border px-3 py-2.5 text-sm">
          <summary className="marker:text-muted-foreground cursor-pointer font-medium">
            [{index + 1}] {chunk.documentName}
            {chunk.score != null ? (
              <span className="text-muted-foreground ml-2 font-mono text-xs font-normal">
                {chunk.score.toFixed(3)}
              </span>
            ) : null}
          </summary>
          <p className="text-muted-foreground mt-2 text-xs whitespace-pre-wrap">{chunk.text}</p>
        </details>
      </li>
    ))}
  </ul>
);

export const MessageParts = ({ parts }: { parts: MessagePart[] }) => (
  <div className="flex min-w-0 flex-col gap-2">
    {parts.map((part) => {
      switch (part.type) {
        case 'text':
          return <StreamMarkdown key={part.id} text={part.text} />;
        case 'reasoning':
          return <ReasoningBlock key={part.id} text={part.text} />;
        case 'tool':
          return (
            <ToolCard
              key={part.id}
              name={part.name}
              state={part.state}
              output={part.output}
              error={part.error}
            />
          );
        case 'citation':
          return <CitationList key={part.id} chunks={part.chunks} />;
      }
    })}
  </div>
);
