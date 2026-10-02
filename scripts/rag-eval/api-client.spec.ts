import type { ChunkConfig } from '@ai-engine/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RagEvalApiClient } from './api-client.js';

type FetchInit = {
  body?: string;
  headers?: Record<string, string>;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const dataset = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'rag-eval',
  embeddingModel: 'nomic-embed-text:latest',
  chunkConfig: {
    strategy: 'recursive',
    chunkSize: 500,
    overlap: 50,
  } satisfies ChunkConfig,
  documentCount: 0,
  chunkCount: 0,
  createdAt: '2026-10-02T00:00:00.000Z',
};

const session = {
  token: 'eval-token',
  expiresAt: '2026-10-03T00:00:00.000Z',
  user: {
    id: '00000000-0000-4000-8000-0000000000a1',
    kind: 'registered',
    displayName: null,
    roles: ['user'],
    permissions: ['knowledge:read', 'knowledge:write'],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RagEvalApiClient 登录', () => {
  it('先用密码登录，之后的知识库请求带 Bearer，退出后清空令牌', async () => {
    const calls: Array<{ path: string; init: FetchInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: FetchInit = {}) => {
        const path = new URL(url).pathname;
        calls.push({ path, init });
        if (path === '/auth/login/password') return json(session, 201);
        if (path === '/auth/logout') return new Response(null, { status: 204 });
        return json(dataset, 201);
      }),
    );
    const client = new RagEvalApiClient('http://localhost:3000');

    await client.login({ identifier: ' Eval@Example.com ', password: 'correct-horse' });
    await client.createDataset('rag-eval', dataset.chunkConfig);
    await client.logout();

    const [login, create, logout] = calls;
    expect(login?.path).toBe('/auth/login/password');
    expect(JSON.parse(String(login?.init.body))).toEqual({
      type: 'email',
      identifier: 'eval@example.com',
      password: 'correct-horse',
    });
    expect(new Headers(create?.init.headers).get('Authorization')).toBe('Bearer eval-token');
    expect(new Headers(logout?.init.headers).get('Authorization')).toBe('Bearer eval-token');
    await expect(client.createDataset('x', dataset.chunkConfig)).rejects.toThrow('尚未登录');
  });

  it('手机号按 phone 登录；登录失败时抛出服务端信息', async () => {
    const seen: FetchInit[] = [];
    const fetchMock = vi.fn(async (_url: string, init: FetchInit = {}) => {
      seen.push(init);
      return json({ code: 'INVALID_CREDENTIALS', message: '账号或密码错误' }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new RagEvalApiClient('http://localhost:3000');

    await expect(
      client.login({ identifier: '13800138000', password: 'wrong-password' }),
    ).rejects.toThrow('账号或密码错误');
    expect(JSON.parse(String(seen[0]?.body))).toMatchObject({ type: 'phone' });
  });

  it('未登录时不发知识库请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const client = new RagEvalApiClient('http://localhost:3000');
    await expect(client.getDocument(dataset.id)).rejects.toThrow('尚未登录');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
