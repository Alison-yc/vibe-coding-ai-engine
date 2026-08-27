import type { CitationChunk, MessagePart } from '@ai-engine/contracts';
import { type ReactNode, useDeferredValue, useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

export const closeOpenFence = (text: string): string => {
  const fenceCount = (text.match(/```/g) ?? []).length;
  return fenceCount % 2 === 1 ? `${text}\n\`\`\`` : text;
};

export const StreamMarkdown = ({ text }: { text: string }) => {
  const deferred = useDeferredValue(text);
  const source = useMemo(() => closeOpenFence(deferred), [deferred]);
  return (
    <div className="text-foreground [&_a]:text-primary [&_code]:bg-code-bg [&_pre]:bg-code-bg max-w-none text-sm [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:p-3">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
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
  <ul className="flex flex-col gap-2">
    {chunks.map((chunk, index) => (
      <li key={chunk.chunkId}>
        <details className="bg-citation-bg rounded-md p-2 text-sm">
          <summary className="cursor-pointer">
            [{index + 1}] {chunk.documentName}
          </summary>
          <p className="text-muted-foreground mt-2 whitespace-pre-wrap">{chunk.text}</p>
        </details>
      </li>
    ))}
  </ul>
);

export const MessageParts = ({ parts }: { parts: MessagePart[] }) => (
  <div className="flex flex-col gap-2">
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
