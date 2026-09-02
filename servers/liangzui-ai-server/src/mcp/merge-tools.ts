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

export const applyFixedMcpParams = (
  args: Record<string, unknown>,
  fixed: Record<string, unknown> | undefined,
): Record<string, unknown> => (fixed ? { ...args, ...fixed } : args);

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
const DATETIME_INTENT = /日期|时间|几点|几号|星期|周几|时区|\b(?:date|time|timezone|today)\b/i;
const CALCULATE_INTENT =
  /计算|算一下|等于多少|calculate|calculator|math|\d\s*(?:\+|-|\*|\/|%|\^)\s*\d/i;
const UUID_INTENT = /\buuid\b|唯一标识|随机标识/i;
const WEATHER_TOOL = /weather|forecast|天气|气象/i;
const CHINESE_CITY_ALIASES: Readonly<Record<string, string>> = {
  北京: 'Beijing, China',
  上海: 'Shanghai, China',
  天津: 'Tianjin, China',
  重庆: 'Chongqing, China',
  广州: 'Guangzhou, China',
  深圳: 'Shenzhen, China',
  成都: 'Chengdu, China',
  杭州: 'Hangzhou, China',
  南京: 'Nanjing, China',
  武汉: 'Wuhan, China',
  西安: "Xi'an, China",
  苏州: 'Suzhou, China',
  青岛: 'Qingdao, China',
  厦门: 'Xiamen, China',
  长沙: 'Changsha, China',
  郑州: 'Zhengzhou, China',
  济南: 'Jinan, China',
  沈阳: 'Shenyang, China',
  大连: 'Dalian, China',
  哈尔滨: 'Harbin, China',
  昆明: 'Kunming, China',
  福州: 'Fuzhou, China',
  合肥: 'Hefei, China',
  南昌: 'Nanchang, China',
  南宁: 'Nanning, China',
  海口: 'Haikou, China',
  贵阳: 'Guiyang, China',
  石家庄: 'Shijiazhuang, China',
  太原: 'Taiyuan, China',
  兰州: 'Lanzhou, China',
  西宁: 'Xining, China',
  银川: 'Yinchuan, China',
  乌鲁木齐: 'Urumqi, China',
  拉萨: 'Lhasa, China',
  香港: 'Hong Kong, China',
  澳门: 'Macau, China',
  台北: 'Taipei, Taiwan',
};

export const normalizeMcpToolArguments = (
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> => {
  if (!WEATHER_TOOL.test(toolName) || typeof args.city_name !== 'string') return args;
  const raw = args.city_name.trim();
  const city = raw.replace(/市$/u, '');
  const normalized = CHINESE_CITY_ALIASES[raw] ?? CHINESE_CITY_ALIASES[city];
  return normalized ? { ...args, city_name: normalized } : args;
};

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

export const extractWeatherCity = (content: string): string | null => {
  const normalized = withoutCommonFilePaths(content).trim();
  const chinese =
    /(?:查询|查一下|看看|告诉我)?\s*([\p{Script=Han}]{2,12}?)(?:今天|明天|后天|现在|当前|实时|未来|本周)?(?:的)?(?:天气|气温|温度|降雨|预报)/u.exec(
      normalized,
    )?.[1];
  if (chinese) return chinese;
  const english =
    /\bweather\s+(?:in|for)\s+([a-z][a-z\s,'-]{1,60})/iu.exec(normalized)?.[1] ??
    /^([a-z][a-z\s,'-]{1,60}?)\s+(?:weather|forecast)\b/iu.exec(normalized)?.[1];
  return english?.trim() || null;
};

export const hasUtilityToolIntent = (content: string): boolean => {
  const normalized = withoutCommonFilePaths(content);
  if (isLiveWeatherQuery(normalized) || UUID_INTENT.test(normalized)) return true;
  if (/什么是|解释|原理|代码|实现|测试|schema|文档/i.test(normalized)) return false;
  return (
    DATETIME_INTENT.test(normalized) ||
    CALCULATE_INTENT.test(normalized.replace(/\d{4}-\d{1,2}-\d{1,2}/g, ''))
  );
};

export const selectToolsForInput = (
  builtin: AgentModelTool[],
  mcp: AgentModelTool[],
  content: string,
  maxToolCount: number,
  fileAccess = true,
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
  if (fileAccess) {
    for (const name of ['read', 'write', 'edit', 'glob', 'grep'] as const) add(findBuiltin(name));
    for (const tool of mcp) add(tool);
  }

  const tools = selected.slice(0, maxToolCount);
  const selectedNames = new Set(tools.map((tool) => tool.name));
  return {
    tools,
    dropped: selected.filter((tool) => !selectedNames.has(tool.name)).map((tool) => tool.name),
    weatherAvailable: weatherTools.length > 0,
  };
};
