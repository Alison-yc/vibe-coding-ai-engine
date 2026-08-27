import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadMcpConfig, saveMcpConfig } from './mcp-config';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mcp-config-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('mcp config file', () => {
  it('文件不存在时返回空配置，写入后能读回', async () => {
    const file = path.join(dir, 'mcp.json');
    await expect(loadMcpConfig(file)).resolves.toEqual({ mcpServers: {} });
    await saveMcpConfig(file, {
      mcpServers: {
        filesystem: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          enabled: false,
          timeout: 30_000,
          flattenNames: false,
          toolPermissions: {},
        },
      },
    });
    const loaded = await loadMcpConfig(file);
    expect(loaded.mcpServers.filesystem?.enabled).toBe(false);
  });

  it('拒绝非法 JSON', async () => {
    const file = path.join(dir, 'bad.json');
    await writeFile(file, '{');
    await expect(loadMcpConfig(file)).rejects.toThrow();
  });

  it('非缺失文件的读失败会抛出', async () => {
    const file = path.join(dir, 'as-dir.json');
    await mkdir(file);
    await expect(loadMcpConfig(file)).rejects.toThrow();
  });
});
