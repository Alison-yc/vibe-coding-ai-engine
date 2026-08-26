import {
  ApiErrorSchema,
  ChatRequestSchema,
  type ChatRequest,
  TranslateRequestSchema,
  TranslateResponseSchema,
  type TranslateRequest,
  type TranslateResponse,
} from '@ai-engine/contracts';
import type { Platform } from '@ai-engine/platform';

export const createExampleChatRequest = (): ChatRequest => {
  const request = {
    sessionId: '550e8400-e29b-41d4-a716-446655440000',
    content: 'ping',
  } satisfies ChatRequest;
  return ChatRequestSchema.parse(request);
};

export const createApiClient = (platform: Platform) => {
  const request = async (path: string, init?: RequestInit): Promise<Response> => {
    const baseUrl = platform.getApiBaseUrl().replace(/\/$/, '');
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  };

  return {
    translate: async (body: TranslateRequest): Promise<TranslateResponse> => {
      const payload = TranslateRequestSchema.parse(body);
      const response = await request('/llm/translate', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const error = ApiErrorSchema.safeParse(data);
        throw new Error(error.success ? error.data.message : `翻译请求失败: ${response.status}`);
      }
      return TranslateResponseSchema.parse(data);
    },
    chat: (body: ChatRequest): Promise<ChatRequest> =>
      Promise.resolve(ChatRequestSchema.parse(body)),
  };
};
