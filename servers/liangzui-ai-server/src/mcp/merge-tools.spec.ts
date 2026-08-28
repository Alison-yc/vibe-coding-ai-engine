import { describe, expect, it } from 'vitest';
import {
  BUILTIN_TOOL_NAMES,
  filterMcpToolNames,
  hasUtilityToolIntent,
  isLiveWeatherQuery,
  isWeatherIntent,
  mcpExposedName,
  mergeAndTrimTools,
  projectMcpToolInputSchema,
  selectToolsForInput,
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

  it('按输入意图优先选择工具且始终遵守六工具上限', () => {
    const builtin = BUILTIN_TOOL_NAMES.map((name) => ({
      name,
      description: name,
      inputSchema: {},
    }));
    const weather = {
      name: 'get_weather_summary',
      description: 'Get weather for a city',
      inputSchema: {},
    };

    const selected = selectToolsForInput(
      builtin,
      [weather],
      '查询北京天气，再告诉我现在几点并计算 2+3，最后生成 UUID',
      6,
    );
    expect(selected.tools.map((tool) => tool.name)).toEqual([
      'get_weather_summary',
      'datetime',
      'calculate',
      'generate_uuid',
      'read',
      'write',
    ]);
    expect(selected.tools).toHaveLength(6);
    expect(selected.weatherAvailable).toBe(true);
  });

  it('普通文件任务维持五个文件工具并保留首个 MCP 槽位', () => {
    const builtin = BUILTIN_TOOL_NAMES.map((name) => ({
      name,
      description: name,
      inputSchema: {},
    }));
    const selected = selectToolsForInput(
      builtin,
      [{ name: 'list_directory', description: 'list files', inputSchema: {} }],
      '查找所有 TypeScript 文件',
      6,
    );
    expect(selected.tools.map((tool) => tool.name)).toEqual([
      'read',
      'write',
      'edit',
      'glob',
      'grep',
      'list_directory',
    ]);
    expect(selected.dropped).toEqual([]);
    expect(isWeatherIntent('北京明天会下雨吗')).toBe(true);
    expect(isWeatherIntent('读取 weather.md')).toBe(false);
    expect(isLiveWeatherQuery('北京天气')).toBe(true);
    expect(isLiveWeatherQuery('北京今天天气怎么样')).toBe(true);
    expect(isLiveWeatherQuery('解释天气形成原理')).toBe(false);
    expect(isLiveWeatherQuery('天气 MCP 如何配置')).toBe(false);
    expect(hasUtilityToolIntent('runtime.ts 里解释 time API')).toBe(false);
  });

  it('文件访问关闭时只装配命中的实用工具并排除文件 MCP', () => {
    const builtin = BUILTIN_TOOL_NAMES.map((name) => ({
      name,
      description: name,
      inputSchema: {},
    }));
    const selected = selectToolsForInput(
      builtin,
      [
        { name: 'get_weather_summary', description: 'weather', inputSchema: {} },
        { name: 'list_directory', description: 'files', inputSchema: {} },
      ],
      '计算 2+3',
      6,
      false,
    );
    expect(selected.tools.map((tool) => tool.name)).toEqual(['calculate']);
    expect(selected.tools.some((tool) => tool.name === 'list_directory')).toBe(false);
  });

  it('可把复杂 MCP schema 投影为弱模型所需的少量参数', () => {
    const untouched = { type: 'object' };
    expect(projectMcpToolInputSchema(untouched, undefined)).toBe(untouched);
    expect(() => projectMcpToolInputSchema(untouched, undefined, ['city_name'])).toThrow(
      '必须与 inputParams 一起配置',
    );
    const projected = projectMcpToolInputSchema(
      {
        type: 'object',
        properties: {
          city_name: { type: 'string' },
          units: { type: 'string' },
          days: { type: 'number' },
        },
        required: [],
      },
      ['city_name', 'units'],
      ['city_name'],
    );
    expect(projected).toEqual({
      type: 'object',
      properties: {
        city_name: { type: 'string' },
        units: { type: 'string' },
      },
      required: ['city_name'],
      additionalProperties: false,
    });
    expect(() =>
      projectMcpToolInputSchema({ type: 'object', properties: { city_name: { type: 'string' } } }, [
        'missing',
      ]),
    ).toThrow('MCP 工具参数不存在');
    expect(() =>
      projectMcpToolInputSchema(
        { type: 'object', properties: { city_name: { type: 'string' } } },
        ['city_name'],
        ['units'],
      ),
    ).toThrow('未包含在 inputParams');
    expect(() => projectMcpToolInputSchema({ type: 'object' }, ['city_name'])).toThrow(
      'MCP 工具参数不存在',
    );
  });
});
