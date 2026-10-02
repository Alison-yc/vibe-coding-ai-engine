import { describe, expect, it } from 'vitest';
import {
  AgentExposedToolsResponseSchema,
  McpConfigFileSchema,
  McpServerPatchRequestSchema,
  McpServerStatusSchema,
} from './index.js';

describe('MCP contracts', () => {
  it('接受 stdio 配置并拒绝通过 patch 改 command', () => {
    expect(
      McpConfigFileSchema.safeParse({
        mcpServers: {
          filesystem: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
            toolFilter: {
              include: ['read_file'],
              inputParams: { read_file: ['path'] },
              requiredParams: { read_file: ['path'] },
            },
          },
        },
      }).success,
    ).toBe(true);
    expect(
      McpConfigFileSchema.safeParse({
        mcpServers: {
          weather: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@dangahagan/weather-mcp@1.25.6'],
            toolFilter: {
              include: ['get_weather_summary'],
              inputParams: { get_weather_summary: ['city_name'] },
              requiredParams: { get_weather_summary: ['city_name'] },
              fixedParams: { get_weather_summary: { units: 'metric' } },
            },
          },
        },
      }).success,
    ).toBe(true);
    expect(
      McpConfigFileSchema.safeParse({
        mcpServers: {
          weather: {
            type: 'stdio',
            command: 'npx',
            toolFilter: { include: ['get_weather'], inputParams: { get_weather: [] } },
          },
        },
      }).success,
    ).toBe(false);
    expect(McpServerPatchRequestSchema.safeParse({ enabled: false, command: 'rm' }).success).toBe(
      false,
    );
    expect(
      McpConfigFileSchema.safeParse({
        mcpServers: {
          'my-fs': { type: 'stdio', command: 'npx' },
        },
      }).success,
    ).toBe(false);
  });

  it('校验 server 状态与暴露给模型的工具列表', () => {
    expect(
      McpServerStatusSchema.safeParse({
        name: 'filesystem',
        type: 'stdio',
        enabled: true,
        status: 'error',
        error: 'command not found',
        toolCount: 0,
        selectedToolCount: 0,
      }).success,
    ).toBe(true);
    expect(
      AgentExposedToolsResponseSchema.safeParse({
        tools: [{ name: 'read', description: '读取', source: 'builtin' }],
        dropped: ['filesystem__write_file'],
        maxToolCount: 6,
      }).success,
    ).toBe(true);
  });
});
