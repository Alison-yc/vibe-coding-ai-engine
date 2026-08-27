import {
  AgentStreamEventSchema,
  AgentStreamRequestSchema,
  PermissionResponseRequestSchema,
  type AgentStreamEvent,
  type AgentStreamRequest,
  type PermissionDecision,
} from '@ai-engine/contracts';
import type { Platform } from '@ai-engine/platform';

const errorMessage = async (response: Response): Promise<string> => {
  const body: unknown = await response.json().catch(() => ({}));
  return typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    typeof body.message === 'string'
    ? body.message
    : `请求失败 ${response.status}`;
};

const parseBlock = (block: string): AgentStreamEvent | null => {
  let eventName = '';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) eventName = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (!eventName || data.length === 0) return null;
  try {
    return AgentStreamEventSchema.parse({
      event: eventName,
      data: JSON.parse(data.join('\n')) as unknown,
    });
  } catch {
    return null;
  }
};

export const streamAgent = async (
  platform: Platform,
  sessionId: string,
  request: AgentStreamRequest,
  signal: AbortSignal,
  onEvent: (event: AgentStreamEvent) => void,
): Promise<void> => {
  const response = await fetch(
    `${platform.getApiBaseUrl().replace(/\/$/, '')}/agent/${sessionId}/stream`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(AgentStreamRequestSchema.parse(request)),
      signal,
    },
  );
  if (!response.ok || !response.body) throw new Error(await errorMessage(response));
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let finished = false;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += chunk.value.replaceAll('\r\n', '\n');
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const event = parseBlock(block);
      if (!event) continue;
      if (event.event === 'done' || event.event === 'error') finished = true;
      onEvent(event);
    }
  }
  if (buffer.trim()) {
    const event = parseBlock(buffer);
    if (event) {
      if (event.event === 'done' || event.event === 'error') finished = true;
      onEvent(event);
    }
  }
  if (!finished && !signal.aborted) throw new Error('Agent 连接意外中断');
};

export const respondAgentPermission = async (
  platform: Platform,
  sessionId: string,
  approvalId: string,
  decision: PermissionDecision,
): Promise<void> => {
  const response = await fetch(
    `${platform.getApiBaseUrl().replace(/\/$/, '')}/agent/${sessionId}/permissions/${approvalId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(PermissionResponseRequestSchema.parse({ decision })),
    },
  );
  if (!response.ok) throw new Error(await errorMessage(response));
};
