import { describe, expect, it } from 'vitest';
import {
  toLlmMessages,
  trimToBudget,
  estimateTokenCount,
  trimHitsToTokenBudget,
} from './context-window';
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
  it('从最近一轮向前裁剪，直到超过 token 预算', () => {
    const trimmed = trimToBudget(
      toLlmMessages([
        message('user', 'aaaaaaaa', 0),
        message('assistant', 'bbbbbbbb', 1),
        message('user', 'cccccccc', 2),
      ]),
      20,
      (text) => text.length,
    );
    expect(trimmed.map((item) => item.content)).toEqual(['bbbbbbbb', 'cccccccc']);
  });

  it('跳过 system 与空文本，空历史返回空数组', () => {
    expect(toLlmMessages([])).toEqual([]);
    expect(
      toLlmMessages([
        message('system', '系统提示', 0),
        message('user', '   ', 1),
        message('user', '有效问题', 2),
      ]),
    ).toEqual([{ role: 'user', content: '有效问题' }]);
  });

  it('挂载 RAG 时为最终 prompt 预留预算，优先裁掉更早的历史', () => {
    const promptContent = 'R'.repeat(120); // 60 tokens
    const prior = trimToBudget(
      [
        { role: 'user', content: '旧问题一' },
        { role: 'assistant', content: '旧回答一' },
        { role: 'user', content: '旧问题二' },
        { role: 'assistant', content: '旧回答二' },
      ],
      Math.max(30 - estimateTokenCount(promptContent), 1),
    );
    expect(prior.map((item) => item.content)).toEqual(['旧回答二']);
  });

  it('即使最新一轮超过预算也保留它', () => {
    const trimmed = trimToBudget(
      [{ role: 'user', content: 'abcdefghij' }],
      3,
      (text) => text.length,
    );
    expect(trimmed).toEqual([{ role: 'user', content: 'abcdefghij' }]);
  });

  it('RAG 引用按 token 预算裁剪，优先保留高分 chunk', () => {
    const hits = trimHitsToTokenBudget(
      [
        {
          documentId: 'd1',
          chunkId: 'c1',
          documentName: 'a.md',
          content: 'A'.repeat(20),
          score: 0.9,
          position: 0,
        },
        {
          documentId: 'd1',
          chunkId: 'c2',
          documentName: 'a.md',
          content: 'B'.repeat(20),
          score: 0.8,
          position: 1,
        },
      ],
      15,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.chunkId).toBe('c1');
  });
});
