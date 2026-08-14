import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama';

const ollamaBaseUrl = () =>
  process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';

export const createOllamaEmbeddings = () =>
  new OllamaEmbeddings({
    model: process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text:latest',
    baseUrl: ollamaBaseUrl(),
    keepAlive: '10m',
  });

export const createChatOllama = () =>
  new ChatOllama({
    model: process.env.OLLAMA_MODEL ?? 'qwen3.5:2b',
    baseUrl: ollamaBaseUrl(),
    think: false,
    keepAlive: '10m',
    temperature: 0.2,
    numPredict: 128,
    numCtx: 2048,
  });
