import { z } from 'zod';
import type { AgentModelTool, AgentToolName, PermissionKind } from '@ai-engine/contracts';

export type ToolContext = {
  workspaceRoot: string;
  signal: AbortSignal;
};

export type PreparedTool = {
  resource: string;
  diff?: string;
  absolutePath?: string;
  workspacePath?: string;
  targetExisted?: boolean;
  excludeSensitive?: boolean;
};

export const assertPreparedPath = (prepared: PreparedTool | undefined, current: string): void => {
  if (prepared?.absolutePath && prepared.absolutePath !== current) {
    throw new Error('目标路径在权限检查后发生变化，请重新发起工具调用');
  }
};

export interface AgentTool<I, O> {
  readonly name: AgentToolName;
  readonly description: string;
  readonly input: z.ZodType<I>;
  readonly permission: PermissionKind;
  prepare(input: I, context: ToolContext): Promise<PreparedTool>;
  execute(input: I, context: ToolContext, prepared?: PreparedTool): Promise<O>;
  toModelOutput(output: O): string;
}

type RegisteredTool = {
  model: AgentModelTool;
  permission: PermissionKind;
  parse: (input: unknown) => unknown;
  prepare: (input: unknown, context: ToolContext) => Promise<PreparedTool>;
  execute: (input: unknown, context: ToolContext, prepared?: PreparedTool) => Promise<string>;
};

export class AgentToolRegistry {
  private readonly tools = new Map<AgentToolName, RegisteredTool>();

  register<I, O>(tool: AgentTool<I, O>): void {
    if (this.tools.has(tool.name)) throw new Error(`Agent 工具已注册：${tool.name}`);
    const inputSchema = z.record(z.string(), z.unknown()).parse(z.toJSONSchema(tool.input));
    this.tools.set(tool.name, {
      model: { name: tool.name, description: tool.description, inputSchema },
      permission: tool.permission,
      parse: (input) => tool.input.parse(input),
      prepare: async (input, context) => tool.prepare(tool.input.parse(input), context),
      execute: async (input, context, prepared) =>
        tool.toModelOutput(await tool.execute(tool.input.parse(input), context, prepared)),
    });
  }

  list(names?: AgentToolName[]): AgentModelTool[] {
    const selected = names ?? [...this.tools.keys()];
    return selected.flatMap((name) => {
      const tool = this.tools.get(name);
      return tool ? [tool.model] : [];
    });
  }

  get(name: string): RegisteredTool | null {
    return this.tools.get(name as AgentToolName) ?? null;
  }
}
