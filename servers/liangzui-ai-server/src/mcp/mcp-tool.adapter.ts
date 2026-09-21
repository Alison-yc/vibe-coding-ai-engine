import type { PermissionKind } from '@ai-engine/contracts';
import { relativeResource, resolveWorkspacePath } from '../agent/workspace-path';
import type { AgentTool, PreparedTool, ToolContext } from '../agent/tools/tool';
import { truncateDiff, truncateToolOutput } from '../agent/tools/tool-output';
import { jsonSchemaToZod } from './json-schema-to-zod';

export type McpCallTool = (
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asText = (output: unknown): string => {
  if (typeof output === 'string') return output;
  if (!isRecord(output) || !Array.isArray(output.content)) return JSON.stringify(output);
  const texts: string[] = [];
  for (const part of output.content) {
    if (!isRecord(part) || typeof part.text !== 'string') continue;
    texts.push(part.text);
  }
  return texts.join('\n');
};

export class McpToolAdapter implements AgentTool<Record<string, unknown>, string> {
  readonly input;

  constructor(
    readonly name: string,
    readonly description: string,
    readonly permission: PermissionKind,
    private readonly originalName: string,
    private readonly resourceParam: string | undefined,
    inputSchema: Record<string, unknown>,
    private readonly callTool: McpCallTool,
  ) {
    this.input = jsonSchemaToZod(inputSchema);
  }

  async prepare(input: Record<string, unknown>, context: ToolContext): Promise<PreparedTool> {
    const raw = this.resourceParam ? input[this.resourceParam] : undefined;
    if (typeof raw !== 'string' || !raw.trim()) {
      return {
        resource: this.name,
        diff: truncateDiff(JSON.stringify(input, null, 2)),
      };
    }
    const target = await resolveWorkspacePath(context.workspaceRoot, raw, {
      allowMissing: this.permission !== 'read',
    });
    return {
      resource: (await relativeResource(context.workspaceRoot, target)) || raw,
      absolutePath: target,
      diff: truncateDiff(JSON.stringify(input, null, 2)),
    };
  }

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
    prepared?: PreparedTool,
  ): Promise<string> {
    if (this.resourceParam && prepared?.absolutePath) {
      input = { ...input, [this.resourceParam]: prepared.absolutePath };
    }
    return asText(await this.callTool(this.originalName, input, context.signal));
  }

  toModelOutput(output: string): string {
    return truncateToolOutput(output || '（空结果）');
  }
}
