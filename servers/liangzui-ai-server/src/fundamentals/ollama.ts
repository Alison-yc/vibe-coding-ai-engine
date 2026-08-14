import { ChatOllama } from '@langchain/ollama';

export const createChatOllama = () =>
  new ChatOllama({
    model: process.env.OLLAMA_MODEL ?? 'qwen3.5:2b',
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
    think: false,
    keepAlive: '10m',
    temperature: 0.2,
    numPredict: 128,
    numCtx: 2048,
  });
