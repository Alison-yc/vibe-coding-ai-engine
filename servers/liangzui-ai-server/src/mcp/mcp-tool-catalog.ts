import type { AgentMode, AgentModelTool } from '@ai-engine/contracts';
import type { RegisteredTool } from '../agent/tools/tool';

export const MCP_TOOL_CATALOG = Symbol('MCP_TOOL_CATALOG');

export interface McpToolCatalog {
  listModelTools(mode: AgentMode): AgentModelTool[];
  get(name: string): RegisteredTool | null;
}

export class EmptyMcpToolCatalog implements McpToolCatalog {
  listModelTools(): AgentModelTool[] {
    return [];
  }

  get(): RegisteredTool | null {
    return null;
  }
}
