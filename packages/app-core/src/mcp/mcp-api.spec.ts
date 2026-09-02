import { describe, expect, it, vi } from 'vitest';
import { createMemoryKeyValueStore, type Platform } from '@ai-engine/platform';
import { listMcpServers, patchMcpServer } from './mcp-api';

const platform = {
  getApiBaseUrl: () => 'http://localhost:3000',
  kv: createMemoryKeyValueStore(),
} as unknown as Platform;

describe('mcp api', () => {
  it('读取 server 列表并用 patch 只提交允许字段', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          servers: [
            {
              name: 'filesystem',
              type: 'stdio',
              enabled: true,
              status: 'connected',
              toolCount: 3,
              selectedToolCount: 2,
            },
          ],
        }),
      ),
    );
    await expect(listMcpServers(platform)).resolves.toEqual([
      expect.objectContaining({ name: 'filesystem', status: 'connected' }),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          name: 'filesystem',
          type: 'stdio',
          enabled: false,
          status: 'disconnected',
          toolCount: 3,
          selectedToolCount: 0,
        }),
      ),
    );
    await patchMcpServer(platform, 'filesystem', { enabled: false });
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ enabled: false }),
      }),
    );
    vi.unstubAllGlobals();
  });
});
