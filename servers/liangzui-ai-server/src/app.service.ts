import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ragQuery as ragQueryFundamentals } from './fundamentals/rag';
import { translate as translateFundamentals } from './fundamentals/translate';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  prompt(message: string): string {
    return `Hello, ${message}!`;
  }

  async translate(text: string): Promise<string> {
    try {
      return await translateFundamentals(text);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Ollama request failed';
      throw new ServiceUnavailableException(
        `Translation failed: ${message}. Check Ollama is running at ${process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434'}.`,
      );
    }
  }

  async ragQuery(question: string): Promise<string> {
    try {
      return await ragQueryFundamentals(question);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Ollama request failed';
      throw new ServiceUnavailableException(
        `RAG query failed: ${message}. Check Ollama is running at ${process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434'}.`,
      );
    }
  }
}
