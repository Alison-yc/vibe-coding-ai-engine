import { describe, expect, it, vi } from 'vitest';
import { VariablePool } from '../engine/variable-pool';
import { QuickJsSandbox } from '../sandbox/quickjs-sandbox';
import type { AddressResolver } from '../security/safe-http';
import { CodeNodeRunner } from './code.runner';
import { HttpRequestNodeRunner } from './http-request.runner';

const context = {
  runId: '00000000-0000-4000-8000-000000000001',
  nodeId: 'node',
  signal: new AbortController().signal,
  emit: vi.fn(),
};

const publicResolver: AddressResolver = async () => [{ address: '93.184.216.34', family: 4 }];

describe('HttpRequestNodeRunner', () => {
  it('渲染请求并返回状态、响应头和正文', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('created', { status: 201, headers: { 'x-test': 'ok' } }));
    const runner = new HttpRequestNodeRunner({ resolve: publicResolver, fetchImpl });
    const result = await runner.run(
      {
        method: 'POST',
        url: 'https://example.com/{{#sys.path#}}',
        headers: { authorization: 'Bearer {{#sys.token#}}' },
        body: '{"value":"{{#sys.value#}}"}',
      },
      new VariablePool({ path: 'items', token: 'secret', value: 'test' }),
      context,
    );
    expect(result.outputs).toMatchObject({ status: 201, body: 'created' });
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('https://example.com/items'),
      expect.objectContaining({
        method: 'POST',
        headers: { authorization: 'Bearer secret' },
        body: '{"value":"test"}',
      }),
    );
  });

  it('拒绝模板渲染后的内网目标', async () => {
    await expect(
      new HttpRequestNodeRunner().run(
        { method: 'GET', url: 'http://{{#sys.host#}}', headers: {} },
        new VariablePool({ host: '127.0.0.1' }),
        context,
      ),
    ).rejects.toThrow('私有或保留');
  });
});

describe('CodeNodeRunner', () => {
  it('读取选择器输入并在 QuickJS 中计算结果', async () => {
    const pool = new VariablePool({});
    pool.set('source', { count: 4 });
    await expect(
      new CodeNodeRunner(new QuickJsSandbox()).run(
        { code: 'return { doubled: inputs.count * 2 };', inputs: { count: ['source', 'count'] } },
        pool,
        context,
      ),
    ).resolves.toEqual({ outputs: { doubled: 8 } });
  });

  it('拒绝缺失输入并隔离 Node 全局对象', async () => {
    const runner = new CodeNodeRunner(new QuickJsSandbox());
    await expect(
      runner.run(
        { code: 'return {};', inputs: { value: ['missing', 'value'] } },
        new VariablePool({}),
        context,
      ),
    ).rejects.toThrow('输入 value 不存在');
    await expect(
      runner.run(
        { code: 'return { secret: process.env };', inputs: {} },
        new VariablePool({}),
        context,
      ),
    ).rejects.toThrow('执行失败');
  });
});
