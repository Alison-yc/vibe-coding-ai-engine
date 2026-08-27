import type { AgentBuiltinToolName, AgentModelTool } from '@ai-engine/contracts';

export const BUILTIN_TOOL_NAMES: AgentBuiltinToolName[] = [
  'read',
  'write',
  'edit',
  'glob',
  'grep',
  'datetime',
  'calculate',
  'generate_uuid',
];

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

export const projectMcpToolInputSchema = (
  schema: Record<string, unknown>,
  inputParams: string[] | undefined,
  requiredParams: string[] | undefined = undefined,
): Record<string, unknown> => {
  if (!inputParams) {
    if (requiredParams) throw new Error('MCP requiredParams 必须与 inputParams 一起配置');
    return schema;
  }
  const properties =
    schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {};
  const missing = inputParams.filter((name) => !(name in properties));
  if (missing.length > 0) throw new Error(`MCP 工具参数不存在：${missing.join('、')}`);
  const allowed = new Set(inputParams);
  const required =
    requiredParams ?? (Array.isArray(schema.required) ? schema.required.map(String) : []);
  const invalidRequired = required.filter((name) => !allowed.has(name));
  if (invalidRequired.length > 0) {
    throw new Error(`MCP 必填参数未包含在 inputParams：${invalidRequired.join('、')}`);
  }
  return {
    ...schema,
    properties: Object.fromEntries(
      Object.entries(properties).filter(([name]) => allowed.has(name)),
    ),
    required: required.filter((name) => allowed.has(name)),
    additionalProperties: false,
  };
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

const WEATHER_INTENT = /天气|气温|温度|降雨|下雨|预报|weather|forecast/i;
const DATETIME_INTENT = /日期|时间|几点|几号|星期|周几|时区|date|time|timezone|today/i;
const CALCULATE_INTENT =
  /计算|算一下|等于多少|calculate|calculator|math|\d\s*(?:\+|-|\*|\/|%|\^)\s*\d/i;
const UUID_INTENT = /\buuid\b|唯一标识|随机标识/i;
const WEATHER_TOOL = /weather|forecast|天气|气象/i;

const withoutCommonFilePaths = (content: string): string =>
  content.replace(
    /\S+\.(?:md|txt|ts|tsx|js|jsx|json|yaml|yml|css|html|py|rs|go|java|xml|csv)\b/gi,
    '',
  );

export const isWeatherIntent = (content: string): boolean =>
  WEATHER_INTENT.test(withoutCommonFilePaths(content));

export const isLiveWeatherQuery = (content: string): boolean => {
  const normalized = withoutCommonFilePaths(content);
  if (/什么是|解释|原理|形成|MCP|工具|配置|代码|实现|测试|schema|文档/i.test(normalized)) {
    return false;
  }
  return (
    isWeatherIntent(normalized) &&
    (/今天|明天|后天|现在|当前|实时|未来|本周|几度|会不会|怎么样|预报|查(?:询)?|看看|告诉我/i.test(
      normalized,
    ) ||
      /^\s*[\p{L}\s,，]{2,30}天气\s*[？?]?\s*$/u.test(normalized))
  );
};

export const selectToolsForInput = (
  builtin: AgentModelTool[],
  mcp: AgentModelTool[],
  content: string,
  maxToolCount: number,
): { tools: AgentModelTool[]; dropped: string[]; weatherAvailable: boolean } => {
  const selected: AgentModelTool[] = [];
  const add = (tool: AgentModelTool | undefined): void => {
    if (tool && !selected.some((candidate) => candidate.name === tool.name)) selected.push(tool);
  };
  const findBuiltin = (name: AgentBuiltinToolName): AgentModelTool | undefined =>
    builtin.find((tool) => tool.name === name);
  const weatherTools = mcp.filter((tool) => WEATHER_TOOL.test(`${tool.name} ${tool.description}`));

  if (isWeatherIntent(content)) add(weatherTools[0]);
  if (DATETIME_INTENT.test(content)) add(findBuiltin('datetime'));
  if (CALCULATE_INTENT.test(content.replace(/\d{4}-\d{1,2}-\d{1,2}/g, ''))) {
    add(findBuiltin('calculate'));
  }
  if (UUID_INTENT.test(content)) add(findBuiltin('generate_uuid'));
  for (const name of ['read', 'write', 'edit', 'glob', 'grep'] as const) add(findBuiltin(name));
  for (const tool of mcp) add(tool);

  const tools = selected.slice(0, maxToolCount);
  const selectedNames = new Set(tools.map((tool) => tool.name));
  return {
    tools,
    dropped: selected.filter((tool) => !selectedNames.has(tool.name)).map((tool) => tool.name),
    weatherAvailable: weatherTools.length > 0,
  };
};
