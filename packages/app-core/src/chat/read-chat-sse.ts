import { ChatStreamEventSchema, type ChatStreamEvent } from '@ai-engine/contracts';

const parseBlock = (block: string): ChatStreamEvent | null => {
  let eventName = '';
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) eventName = line.slice(6).trim();
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (!eventName || dataLines.length === 0) return null;
  try {
    const parsed = ChatStreamEventSchema.safeParse({
      event: eventName,
      data: JSON.parse(dataLines.join('\n')) as unknown,
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const readChatSse = async (
  response: Response,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> => {
  if (!response.body) throw new Error('chat-error:missing-body');
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += chunk.value;
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const event = parseBlock(block);
      if (event) onEvent(event);
    }
  }
};
