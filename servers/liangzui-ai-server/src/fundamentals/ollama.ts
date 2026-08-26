import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama';
import { readOllamaConfig } from '../config/ollama.config';

export const createOllamaEmbeddings = () => {
  const config = readOllamaConfig();
  return new OllamaEmbeddings({
    model: config.embedModel,
    baseUrl: config.baseUrl,
    keepAlive: '10m',
  });
};

export const createChatOllama = () => {
  const config = readOllamaConfig();
  return new ChatOllama({
    model: config.chatModel,
    baseUrl: config.baseUrl,
    think: false,
    keepAlive: '10m',
    temperature: 0.2,
    numPredict: 128,
    numCtx: 2048,
  });
};
