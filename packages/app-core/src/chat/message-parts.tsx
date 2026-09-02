import type { CitationChunk, MessagePart } from '@ai-engine/contracts';
import { type ReactNode, useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useChatTranslation } from '../i18n/use-chat-translation';

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

export const ReasoningBlock = ({ text }: { text: string }) => {
  const { t } = useChatTranslation();
  return (
    <details className="border-border min-w-0 rounded-md border p-2 text-sm">
      <summary className="text-muted-foreground cursor-pointer truncate">
        {t('reasoning.summary')}
      </summary>
      <p className="mt-2 whitespace-pre-wrap">{text}</p>
    </details>
  );
};

type ToolState = Extract<MessagePart, { type: 'tool' }>['state'];

export const ToolCard = ({
  name,
  state,
  output,
  error,
  input,
}: {
  name: string;
  state: ToolState;
  output?: string;
  error?: string;
  input?: unknown;
}): ReactNode => {
  const { t } = useChatTranslation();
  return (
    <article className="border-border bg-card min-w-0 rounded-md border p-3 text-sm">
      <p className="truncate" title={name}>
        {t('tool.summary', { name, state: t(`tool.state.${state}`) })}
      </p>
      {input !== undefined ? (
        <details className="mt-2 min-w-0">
          <summary className="text-muted-foreground cursor-pointer truncate">
            {t('tool.viewInput')}
          </summary>
          <pre className="bg-muted mt-1 max-h-48 max-w-full overflow-auto rounded p-2 text-xs">
            {JSON.stringify(input, null, 2)}
          </pre>
        </details>
      ) : null}
      {output ? <p className="text-muted-foreground mt-1 whitespace-pre-wrap">{output}</p> : null}
      {error ? <p className="text-destructive mt-1">{error}</p> : null}
    </article>
  );
};

export const CitationList = ({ chunks }: { chunks: CitationChunk[] }) => {
  const { t } = useChatTranslation();
  return (
    <details className="bg-citation-bg/50 border-citation-border min-w-0 rounded-lg border px-3 py-2.5 text-sm">
      <summary className="marker:text-muted-foreground cursor-pointer font-medium">
        {t('citation.summary', { count: chunks.length })}
      </summary>
      <ol className="border-citation-border mt-2 flex min-w-0 flex-col border-t">
        {chunks.map((chunk, index) => (
          <li className="border-citation-border border-b py-2 last:border-b-0" key={chunk.chunkId}>
            <p className="text-xs font-medium">
              [{index + 1}] {chunk.documentName}
            </p>
            <p className="text-muted-foreground mt-1 text-xs whitespace-pre-wrap">{chunk.text}</p>
          </li>
        ))}
      </ol>
    </details>
  );
};

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
              input={part.input}
            />
          );
        case 'citation':
          return <CitationList key={part.id} chunks={part.chunks} />;
      }
    })}
  </div>
);
