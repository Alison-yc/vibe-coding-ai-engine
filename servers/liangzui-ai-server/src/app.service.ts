import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { VECTOR_STORE, type VectorStore } from './database/vector-store';
import { ragQuery as ragQueryFundamentals } from './fundamentals/rag';
import { translate as translateFundamentals } from './fundamentals/translate';
import { isLlmGatewayError } from './llm/llm-errors';
import { LLM_GATEWAY, type LlmGateway } from './llm/llm-gateway';

@Injectable()
export class AppService {
  constructor(
    @Inject(LLM_GATEWAY) private readonly llmGateway: LlmGateway,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  prompt(message: string): string {
    return `Hello, ${message}!`;
  }

  async translate(text: string, signal?: AbortSignal): Promise<string> {
    try {
      return await translateFundamentals(this.llmGateway, text, signal);
    } catch (error) {
      if (isLlmGatewayError(error)) throw error;
      const message = error instanceof Error ? error.message : 'Ollama request failed';
      throw new ServiceUnavailableException(`Translation failed: ${message}`);
    }
  }

  async ragQuery(question: string, signal?: AbortSignal): Promise<string> {
    try {
      return await ragQueryFundamentals(this.llmGateway, this.vectorStore, question, signal);
    } catch (error) {
      if (isLlmGatewayError(error)) throw error;
      const message = error instanceof Error ? error.message : 'Ollama request failed';
      throw new ServiceUnavailableException(`RAG query failed: ${message}`);
    }
  }
}
