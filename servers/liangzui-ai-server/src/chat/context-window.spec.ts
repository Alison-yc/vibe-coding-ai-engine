import { describe, expect, it } from 'vitest';
import { toLlmMessages, trimToBudget } from './context-window';
import type { ChatMessage } from '@ai-engine/contracts';

const message = (role: ChatMessage['role'], text: string, seq: number): ChatMessage => ({
  id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
  sessionId: '00000000-0000-4000-8000-000000000001',
  role,
  parts: [{ type: 'text', id: `p${seq}`, text }],
  seq,
  status: 'complete',
  createdAt: '2026-08-27T00:00:00.000Z',
});

describe('上下文窗口', () => {
  it('从最近一轮向前裁剪，直到超过 token 预算', async () => {
    const trimmed = await trimToBudget(
      toLlmMessages([
        message('user', 'aaaaaaaa', 0),
        message('assistant', 'bbbbbbbb', 1),
        message('user', 'cccccccc', 2),
      ]),
      20,
      async (text) => text.length,
    );
    expect(trimmed.map((item) => item.content)).toEqual(['bbbbbbbb', 'cccccccc']);
  });
});
