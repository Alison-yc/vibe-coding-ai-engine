import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { McpConfigFileSchema, type McpConfigFile } from '@ai-engine/contracts';

export const loadMcpConfig = async (configPath: string): Promise<McpConfigFile> => {
  const resolved = path.resolve(configPath);
  const raw = await readFile(resolved, 'utf8').catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return '{}';
    throw error;
  });
  return McpConfigFileSchema.parse(JSON.parse(raw) as unknown);
};

export const saveMcpConfig = async (configPath: string, config: McpConfigFile): Promise<void> => {
  const resolved = path.resolve(configPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(McpConfigFileSchema.parse(config), null, 2)}\n`);
};

export const loadMcpConfigWithPresets = async (
  configPath: string,
): Promise<{ config: McpConfigFile; added: string[] }> => {
  const resolved = path.resolve(configPath);
  const [config, presets] = await Promise.all([
    loadMcpConfig(resolved),
    loadMcpConfig(`${resolved}.example`),
  ]);
  const missing = Object.entries(presets.mcpServers).filter(
    ([name]) => !(name in config.mcpServers),
  );
  if (missing.length === 0) return { config, added: [] };
  const merged = McpConfigFileSchema.parse({
    mcpServers: {
      ...Object.fromEntries(missing),
      ...config.mcpServers,
    },
  });
  await saveMcpConfig(resolved, merged);
  return { config: merged, added: missing.map(([name]) => name) };
};
