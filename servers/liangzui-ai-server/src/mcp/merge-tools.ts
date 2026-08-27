import type { AgentBuiltinToolName, AgentModelTool } from '@ai-engine/contracts';

export const BUILTIN_TOOL_NAMES: AgentBuiltinToolName[] = ['read', 'write', 'edit', 'glob', 'grep'];

const sanitizeToolName = (value: string): string => {
  const cleaned = value.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  const named = /^[a-zA-Z]/.test(cleaned) ? cleaned : `mcp_${cleaned}`;
  return named.slice(0, 128);
};

export const mcpExposedName = (
  serverName: string,
  toolName: string,
  flatten: boolean,
  usedNames: Set<string>,
): string => {
  const flat = sanitizeToolName(toolName);
  if (flatten && !usedNames.has(flat)) return flat;
  return sanitizeToolName(`${serverName}__${toolName}`);
};

export const filterMcpToolNames = (names: string[], include: string[] | undefined): string[] => {
  if (!include || include.length === 0) return [];
  const allowed = new Set(include);
  return names.filter((name) => allowed.has(name));
};

export const mergeAndTrimTools = (
  builtin: AgentModelTool[],
  mcp: AgentModelTool[],
  maxToolCount: number,
): { tools: AgentModelTool[]; dropped: string[] } => {
  const used = new Set(builtin.map((tool) => tool.name));
  const merged = [...builtin];
  for (const tool of mcp) {
    if (used.has(tool.name)) continue;
    used.add(tool.name);
    merged.push(tool);
  }
  return {
    tools: merged.slice(0, maxToolCount),
    dropped: merged.slice(maxToolCount).map((tool) => tool.name),
  };
};
