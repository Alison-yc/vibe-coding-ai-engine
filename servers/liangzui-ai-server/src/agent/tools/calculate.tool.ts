import { CalculateToolInputSchema, type CalculateToolInput } from '@ai-engine/contracts';
import type { AgentTool, ToolContext } from './tool';

class ArithmeticParser {
  private position = 0;
  private depth = 0;

  constructor(private readonly expression: string) {}

  parse(): number {
    const result = this.parseExpression();
    this.skipSpaces();
    if (this.position !== this.expression.length) this.fail();
    if (!Number.isFinite(result)) throw new Error('计算结果不是有限数值');
    return result;
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    while (true) {
      if (this.consume('+')) value += this.parseTerm();
      else if (this.consume('-')) value -= this.parseTerm();
      else return value;
    }
  }

  private parseTerm(): number {
    let value = this.parseUnary();
    while (true) {
      if (this.consume('*')) value *= this.parseUnary();
      else if (this.consume('/')) value /= this.parseUnary();
      else if (this.consume('%')) value %= this.parseUnary();
      else return value;
    }
  }

  private parseUnary(): number {
    if (this.consume('+')) return this.parseUnary();
    if (this.consume('-')) return -this.parseUnary();
    return this.parsePower();
  }

  private parsePower(): number {
    const value = this.parsePrimary();
    return this.consume('^') ? value ** this.parseUnary() : value;
  }

  private parsePrimary(): number {
    if (this.consume('(')) {
      this.depth += 1;
      if (this.depth > 32) throw new Error('括号嵌套不能超过 32 层');
      const value = this.parseExpression();
      if (!this.consume(')')) this.fail();
      this.depth -= 1;
      return value;
    }
    this.skipSpaces();
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(
      this.expression.slice(this.position),
    );
    if (!match) this.fail();
    this.position += match[0].length;
    return Number(match[0]);
  }

  private consume(token: string): boolean {
    this.skipSpaces();
    if (!this.expression.startsWith(token, this.position)) return false;
    this.position += token.length;
    return true;
  }

  private skipSpaces(): void {
    while (/\s/u.test(this.expression[this.position] ?? '')) this.position += 1;
  }

  private fail(): never {
    throw new Error(`算术表达式无效，位置 ${this.position + 1}`);
  }
}

export const evaluateArithmetic = (expression: string): number =>
  new ArithmeticParser(expression).parse();

export class CalculateTool implements AgentTool<CalculateToolInput, number> {
  readonly name = 'calculate' as const;
  readonly permission = 'read' as const;
  readonly input = CalculateToolInputSchema;
  readonly description =
    '精确计算基础算术表达式，支持括号及 + - * / % ^。不要自行心算，也不要传入变量、函数或代码。';

  prepare(input: CalculateToolInput) {
    evaluateArithmetic(input.expression);
    return Promise.resolve({ resource: 'local-calculation' });
  }

  execute(input: CalculateToolInput, _context: ToolContext): Promise<number> {
    return Promise.resolve(evaluateArithmetic(input.expression));
  }

  toModelOutput(output: number): string {
    return String(output);
  }
}
