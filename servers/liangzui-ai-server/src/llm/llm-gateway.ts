import type {
  AgentModelRequest,
  AgentModelResponse,
  ChatRequest,
  ChatResponse,
  LlmStreamEvent,
  ModelCapability,
  ModelId,
} from '@ai-engine/contracts';

export const LLM_GATEWAY = Symbol('LLM_GATEWAY');

// 当前复用 HTTP 会话契约（sessionId + content）。多轮 messages / tools 在对话页与 Agent 批次扩展。
export interface LlmGateway {
  agentChat(request: AgentModelRequest, signal?: AbortSignal): Promise<AgentModelResponse>;
  chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse>;
  stream(request: ChatRequest, signal?: AbortSignal): AsyncIterable<LlmStreamEvent>;
  embed(texts: string[], signal?: AbortSignal): Promise<number[][]>;
  countTokens(text: string): Promise<number>;
  listInstalledModels(signal?: AbortSignal): Promise<string[]>;
  capabilities(modelId: ModelId): ModelCapability;
}
