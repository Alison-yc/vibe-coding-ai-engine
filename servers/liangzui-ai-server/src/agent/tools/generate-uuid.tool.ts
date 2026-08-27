import { randomUUID } from 'node:crypto';
import { GenerateUuidToolInputSchema, type GenerateUuidToolInput } from '@ai-engine/contracts';
import type { AgentTool, ToolContext } from './tool';

export class GenerateUuidTool implements AgentTool<GenerateUuidToolInput, string[]> {
  readonly name = 'generate_uuid' as const;
  readonly permission = 'read' as const;
  readonly input = GenerateUuidToolInputSchema;
  readonly description = '生成 1 到 10 个 UUID v4。仅在用户明确需要 UUID 或唯一标识符时调用。';

  prepare(input: GenerateUuidToolInput) {
    return Promise.resolve({ resource: `uuid-count:${input.count ?? 1}` });
  }

  execute(input: GenerateUuidToolInput, _context: ToolContext): Promise<string[]> {
    return Promise.resolve(Array.from({ length: input.count ?? 1 }, () => randomUUID()));
  }

  toModelOutput(output: string[]): string {
    return output.join('\n');
  }
}
