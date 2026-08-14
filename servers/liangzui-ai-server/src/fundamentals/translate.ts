import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createChatOllama } from './ollama';

const llm = createChatOllama();

export const translate = async (text: string) => {
  const conversation = [
    new SystemMessage(
      'Translate the following text to English. Output only the translation.',
    ),
    new HumanMessage(text),
  ];
  const res = await llm.invoke(conversation);
  return res.text;
};
