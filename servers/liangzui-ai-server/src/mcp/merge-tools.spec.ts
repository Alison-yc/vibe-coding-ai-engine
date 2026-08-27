import { describe, expect, it } from 'vitest';
import {
  BUILTIN_TOOL_NAMES,
  filterMcpToolNames,
  mcpExposedName,
  mergeAndTrimTools,
} from './merge-tools';

describe('MCP tool merge', () => {
  it('冲突时给 MCP 工具加 server 前缀', () => {
    const used = new Set<string>(BUILTIN_TOOL_NAMES);
    expect(mcpExposedName('filesystem', 'read', true, used)).toBe('filesystem__read');
    expect(mcpExposedName('filesystem', 'list_directory', true, used)).toBe('list_directory');
    expect(mcpExposedName('filesystem', 'read-file', true, used)).toBe('read_file');
  });

  it('未勾选的工具不会进入模型列表，超额按上限裁剪并记录 dropped', () => {
    expect(filterMcpToolNames(['a', 'b'], undefined)).toEqual([]);
    expect(filterMcpToolNames(['a', 'b'], ['b'])).toEqual(['b']);
    const merged = mergeAndTrimTools(
      [{ name: 'read', description: 'r', inputSchema: {} }],
      [
        { name: 'fs__a', description: 'a', inputSchema: {} },
        { name: 'fs__b', description: 'b', inputSchema: {} },
      ],
      2,
    );
    expect(merged.tools.map((tool) => tool.name)).toEqual(['read', 'fs__a']);
    expect(merged.dropped).toEqual(['fs__b']);
  });

  it('与内置同名的 MCP 工具在合并时被跳过', () => {
    const merged = mergeAndTrimTools(
      [{ name: 'read', description: 'r', inputSchema: {} }],
      [{ name: 'read', description: 'mcp', inputSchema: {} }],
      6,
    );
    expect(merged.tools).toHaveLength(1);
    expect(merged.dropped).toEqual([]);
    expect(filterMcpToolNames(['a'], [])).toEqual([]);
  });
});
