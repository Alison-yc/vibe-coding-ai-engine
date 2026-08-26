const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_CHAT_MODEL = 'qwen3.5:2b';
const DEFAULT_EMBED_MODEL = 'nomic-embed-text:latest';

export const readOllamaConfig = () => ({
  baseUrl: process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL,
  chatModel: process.env.OLLAMA_MODEL ?? DEFAULT_CHAT_MODEL,
  embedModel: process.env.OLLAMA_EMBED_MODEL ?? DEFAULT_EMBED_MODEL,
});
