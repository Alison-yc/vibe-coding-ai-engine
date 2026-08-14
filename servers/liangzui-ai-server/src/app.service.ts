import { Injectable } from '@nestjs/common';
import { translate as translateFundamentals } from './fundamentals/prompt';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  prompt(message: string): string {
    return `Hello, ${message}!`;
  }

  async translate(text: string): Promise<any> {
    const res = await translateFundamentals(text);
    return res;
  }
}
