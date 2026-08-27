import type { ChatMessage, LlmChatMessage } from '@ai-engine/contracts';

const textOf = (message: ChatMessage): string =>
  message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim();

export const toLlmMessages = (history: ChatMessage[]): LlmChatMessage[] =>
  history.flatMap((message) => {
    if (message.role === 'system') return [];
    const content = textOf(message);
    if (!content) return [];
    return [{ role: message.role === 'assistant' ? 'assistant' : 'user', content }];
  });

export const trimToBudget = async (
  messages: LlmChatMessage[],
  budgetTokens: number,
  countTokens: (text: string) => Promise<number>,
): Promise<LlmChatMessage[]> => {
  if (messages.length === 0) return [];
  const kept: LlmChatMessage[] = [];
  let used = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    const cost = await countTokens(message.content);
    if (kept.length > 0 && used + cost > budgetTokens) break;
    kept.unshift(message);
    used += cost;
  }
  return kept;
};
