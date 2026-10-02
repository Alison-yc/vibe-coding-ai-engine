import {
  ChatRequestSchema,
  type ChatRequest,
  TranslateRequestSchema,
  TranslateResponseSchema,
  type TranslateRequest,
  type TranslateResponse,
} from '@ai-engine/contracts';
import type { Platform } from '@ai-engine/platform';
import { apiJson } from './http';

export const createExampleChatRequest = (): ChatRequest => {
  const request = {
    sessionId: '550e8400-e29b-41d4-a716-446655440000',
    content: 'ping',
  } satisfies ChatRequest;
  return ChatRequestSchema.parse(request);
};

export const createApiClient = (platform: Platform) => ({
  translate: async (body: TranslateRequest): Promise<TranslateResponse> => {
    const payload = TranslateRequestSchema.parse(body);
    const data = await apiJson(platform, '/llm/translate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return TranslateResponseSchema.parse(data);
  },
  chat: (body: ChatRequest): Promise<ChatRequest> => Promise.resolve(ChatRequestSchema.parse(body)),
});
