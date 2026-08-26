export class OllamaUnreachableError extends Error {
  constructor(baseUrl: string, options?: ErrorOptions) {
    super(`无法连接 Ollama；请检查 Ollama 是否在 ${baseUrl} 运行`, options);
    this.name = 'OllamaUnreachableError';
  }
}

export class ModelNotFoundError extends Error {
  constructor(model: string, options?: ErrorOptions) {
    super(`本地未找到模型 ${model}；请先执行 ollama pull ${model}`, options);
    this.name = 'ModelNotFoundError';
  }
}

export class ContextOverflowError extends Error {
  constructor(options?: ErrorOptions) {
    super('输入超过模型有效上下文长度；请减少历史消息或检索片段', options);
    this.name = 'ContextOverflowError';
  }
}

export class LlmTimeoutError extends Error {
  constructor(operation: string, options?: ErrorOptions) {
    super(`${operation} 超时；模型可能仍在加载，请稍后重试`, options);
    this.name = 'LlmTimeoutError';
  }
}

export const isLlmGatewayError = (error: unknown): error is Error =>
  error instanceof OllamaUnreachableError ||
  error instanceof ModelNotFoundError ||
  error instanceof ContextOverflowError ||
  error instanceof LlmTimeoutError;
