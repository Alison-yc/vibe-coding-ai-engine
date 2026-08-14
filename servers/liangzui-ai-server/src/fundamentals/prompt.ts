import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOllama } from '@langchain/ollama';

const llm = new ChatOllama({ model: 'qwen3.5:2b' });

export const translate = async (text: string) => {
  const conversation = [
    new SystemMessage('你是一个专业的翻译助手，请将问题翻译成英文。'),
    new HumanMessage(text),
  ];
  const res = await llm.invoke(conversation);
  console.log(res);
  return res;
};
