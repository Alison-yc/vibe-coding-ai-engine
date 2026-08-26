import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { describe, expect, it, vi } from 'vitest';

const llm = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('./ollama', () => ({
  createChatOllama: () => llm,
}));

import { translate } from './translate';

describe('translate', () => {
  it('把系统提示词和用户文本传给模型', async () => {
    llm.invoke.mockResolvedValueOnce({ text: 'Hello' });

    await expect(translate('你好')).resolves.toBe('Hello');
    expect(llm.invoke).toHaveBeenCalledWith([expect.any(SystemMessage), expect.any(HumanMessage)]);

    const messages = llm.invoke.mock.calls[0]?.[0];
    expect(messages?.[0].content).toContain('Output only the translation');
    expect(messages?.[1].content).toBe('你好');
  });
});
