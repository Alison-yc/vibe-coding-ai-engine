import { createMemoryKeyValueStore, type Platform } from '@ai-engine/platform';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { respondAgentPermission, streamAgent } from './agent-api';

const platform: Platform = {
  capabilities: {
    nativeDirectoryPicker: false,
    windowControls: false,
    routerMode: 'history',
    devTools: true,
  },
  pickDirectory: async () => null,
  pickFiles: async () => [],
  kv: createMemoryKeyValueStore(),
  getApiBaseUrl: () => 'http://localhost:3000',
  openExternal: async () => undefined,
  getAppInfo: async () => ({ name: 'test', version: '0.0.0' }),
  getSystemTheme: () => 'light',
  subscribeSystemTheme: () => () => undefined,
  window: {
    minimize: async () => undefined,
    maximize: async () => undefined,
    close: async () => undefined,
    reload: async () => undefined,
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('agent api', () => {
  it('解析审批与完成 SSE 事件', async () => {
    const sessionId = crypto.randomUUID();
    const approvalId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const body = [
      `event: permission.asked\ndata: ${JSON.stringify({
        id: approvalId,
        sessionId,
        toolCallId: 'call-1',
        tool: 'write',
        resource: 'README.md',
        diff: '+new',
      })}\n\n`,
      `event: done\ndata: ${JSON.stringify({ messageId, status: 'complete' })}\n\n`,
    ].join('');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(body));
              controller.close();
            },
          }),
          { status: 200 },
        ),
      ),
    );
    const events: string[] = [];
    await streamAgent(
      platform,
      sessionId,
      { content: '写文件', workspaceRoot: '/workspace', mode: 'edit' },
      new AbortController().signal,
      (event) => events.push(event.event),
    );
    expect(events).toEqual(['permission.asked', 'done']);
  });

  it('提交审批决定', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await respondAgentPermission(
      platform,
      crypto.randomUUID(),
      crypto.randomUUID(),
      'allow-session',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/permissions/'),
      expect.objectContaining({ method: 'POST', body: '{"decision":"allow-session"}' }),
    );
  });
});
