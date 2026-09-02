import {
  DEFAULT_CHUNK_CONFIG,
  type ChunkConfig,
  type SplitPreviewChunk,
} from '@ai-engine/contracts';

const CHINESE_SEPARATORS = ['\n\n', '\n', '。', '！', '？', '；', '，', ' ', ''];

export type SplitChunk = SplitPreviewChunk;

const overlapSlice = (text: string, overlap: number): string =>
  overlap <= 0 ? '' : text.slice(Math.max(0, text.length - overlap));

const splitBySeparator = (text: string, separator: string): string[] => {
  if (separator === '') return [...text];
  return text.split(separator);
};

const joinWithSeparator = (parts: string[], separator: string): string => {
  if (separator === '') return parts.join('');
  return parts.join(separator);
};

const splitRecursive = (text: string, config: ChunkConfig, separators: string[]): string[] => {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if ([...trimmed].length <= config.chunkSize) return [trimmed];

  const [separator = '', ...rest] = separators;
  const parts = splitBySeparator(trimmed, separator).filter((part) => part.length > 0);
  if (parts.length <= 1) {
    if (rest.length === 0) {
      const chars = [...trimmed];
      const chunks: string[] = [];
      for (let index = 0; index < chars.length; index += config.chunkSize - config.overlap) {
        chunks.push(chars.slice(index, index + config.chunkSize).join(''));
      }
      return chunks.filter((chunk) => chunk.length > 0);
    }
    return splitRecursive(trimmed, config, rest);
  }

  const chunks: string[] = [];
  let current: string[] = [];
  for (const part of parts) {
    const candidate = joinWithSeparator([...current, part], separator);
    if ([...candidate].length > config.chunkSize && current.length > 0) {
      const merged = joinWithSeparator(current, separator);
      chunks.push(...splitRecursive(merged, config, rest));
      const overlapText = overlapSlice(merged, config.overlap);
      current = overlapText ? [overlapText, part] : [part];
    } else {
      current.push(part);
    }
  }
  if (current.length > 0) {
    chunks.push(...splitRecursive(joinWithSeparator(current, separator), config, rest));
  }
  return chunks.filter((chunk) => chunk.trim().length > 0);
};

const splitFixed = (text: string, config: ChunkConfig): string[] => {
  const chars = [...text.trim()];
  if (chars.length === 0) return [];
  const step = Math.max(config.chunkSize - config.overlap, 1);
  const chunks: string[] = [];
  for (let index = 0; index < chars.length; index += step) {
    chunks.push(chars.slice(index, index + config.chunkSize).join(''));
  }
  return chunks;
};

const splitMarkdown = (text: string, config: ChunkConfig): SplitChunk[] => {
  const lines = text.split('\n');
  const sections: Array<{ headingPath: string; body: string }> = [];
  const headingStack: string[] = [];
  let body: string[] = [];

  const flush = () => {
    const content = body.join('\n').trim();
    if (!content) {
      body = [];
      return;
    }
    sections.push({ headingPath: headingStack.filter(Boolean).join(' / '), body: content });
    body = [];
  };

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (heading) {
      flush();
      const level = heading[1]?.length ?? 1;
      headingStack.length = level - 1;
      headingStack[level - 1] = heading[2]?.trim() ?? '';
      continue;
    }
    body.push(line);
  }
  flush();

  const chunks: SplitChunk[] = [];
  for (const section of sections) {
    const pieces = splitRecursive(section.body, config, CHINESE_SEPARATORS);
    for (const piece of pieces) {
      chunks.push({
        position: chunks.length,
        content: piece,
        headingPath: section.headingPath || undefined,
      });
    }
  }
  return chunks;
};

export const splitDocumentText = (
  text: string,
  chunkConfig: ChunkConfig = DEFAULT_CHUNK_CONFIG,
): SplitChunk[] => {
  const config = chunkConfig;
  if (config.strategy === 'markdown') return splitMarkdown(text, config);
  const pieces =
    config.strategy === 'fixed'
      ? splitFixed(text, config)
      : splitRecursive(text, config, CHINESE_SEPARATORS);
  return pieces.map((content, position) => ({ position, content }));
};
