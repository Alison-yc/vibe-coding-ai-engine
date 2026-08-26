import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const similaritySearch = vi.fn();
  return {
    fromDocuments: vi.fn().mockResolvedValue({ similaritySearch }),
    invoke: vi.fn(),
    similaritySearch,
  };
});

vi.mock('@langchain/classic/vectorstores/memory', () => ({
  MemoryVectorStore: {
    fromDocuments: state.fromDocuments,
  },
}));

vi.mock('./ollama', () => ({
  createChatOllama: () => ({ invoke: state.invoke }),
  createOllamaEmbeddings: () => ({ embedQuery: vi.fn() }),
}));

import { ragQuery } from './rag';

describe('ragQuery', () => {
  it('检索资料并把上下文传给模型', async () => {
    state.similaritySearch.mockResolvedValueOnce([
      { pageContent: '我住在北京。' },
      { pageContent: '我的爱好是编程。' },
    ]);
    state.invoke.mockResolvedValueOnce({ text: '你住在北京。' });

    await expect(ragQuery('我住哪')).resolves.toBe('你住在北京。');
    expect(state.similaritySearch).toHaveBeenCalledWith('我住哪', 3);
    expect(state.invoke).toHaveBeenCalledWith([
      expect.any(SystemMessage),
      expect.any(HumanMessage),
    ]);

    const messages = state.invoke.mock.calls[0]?.[0];
    expect(messages?.[0].content).toContain('我住在北京。');
    expect(messages?.[1].content).toBe('我住哪');
  });

  it('复用已初始化的向量存储', async () => {
    state.similaritySearch.mockResolvedValueOnce([]);
    state.invoke.mockResolvedValueOnce({ text: '我不知道' });

    await expect(ragQuery('未知问题')).resolves.toBe('我不知道');
    expect(state.fromDocuments).toHaveBeenCalledTimes(1);
  });
});
