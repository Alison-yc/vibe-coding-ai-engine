import { describe, expect, it, vi } from 'vitest';
import {
  assertSafeUrl,
  isPrivateAddress,
  safeHttpRequest,
  type AddressResolver,
} from './safe-http';

const publicResolver: AddressResolver = async () => [{ address: '93.184.216.34', family: 4 }];

describe('assertSafeUrl', () => {
  it('允许解析到公网地址的 HTTP(S) URL', async () => {
    await expect(assertSafeUrl('https://example.com/path', publicResolver)).resolves.toMatchObject({
      hostname: 'example.com',
    });
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
  });

  it.each([
    'http://127.0.0.1:5432',
    'http://10.0.0.1',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/',
  ])('拦截私网地址 %s', async (url) => {
    await expect(assertSafeUrl(url)).rejects.toThrow('私有或保留');
  });

  it('拒绝危险协议、凭据和无法解析的域名', async () => {
    await expect(assertSafeUrl('不是 URL')).rejects.toThrow('URL 不合法');
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow('http/https');
    await expect(assertSafeUrl('https://user:pass@example.com', publicResolver)).rejects.toThrow(
      '凭据',
    );
    await expect(assertSafeUrl('https://example.com', async () => [])).rejects.toThrow('无法解析');
  });

  it.each([
    ['0.0.0.0', true],
    ['100.64.0.1', true],
    ['172.16.0.1', true],
    ['192.168.0.1', true],
    ['198.18.0.1', true],
    ['224.0.0.1', true],
    ['fc00::1', true],
    ['fe80::1', true],
    ['::ffff:127.0.0.1', true],
    ['::ffff:7f00:1', true],
    ['2001:4860:4860::8888', false],
    ['invalid', true],
  ])('识别地址 %s 的私网属性', (address, expected) => {
    expect(isPrivateAddress(address)).toBe(expected);
  });

  it('域名解析结果包含任一私网地址时拒绝', async () => {
    await expect(
      assertSafeUrl('https://example.com', async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ]),
    ).rejects.toThrow('私有或保留');
  });
});

describe('safeHttpRequest', () => {
  it('返回受大小限制保护的公网响应', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    const result = await safeHttpRequest({
      method: 'GET',
      url: 'https://example.com',
      headers: {},
      signal: new AbortController().signal,
      resolve: publicResolver,
      fetchImpl,
    });
    expect(result).toMatchObject({ status: 200, body: 'ok' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('每次重定向都重新校验并拦截跳转到内网', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }),
      );
    await expect(
      safeHttpRequest({
        method: 'GET',
        url: 'https://example.com',
        headers: {},
        signal: new AbortController().signal,
        resolve: publicResolver,
        fetchImpl,
      }),
    ).rejects.toThrow('私有或保留');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('拒绝超大响应和超过上限的重定向', async () => {
    await expect(
      safeHttpRequest({
        method: 'GET',
        url: 'https://example.com',
        headers: {},
        signal: new AbortController().signal,
        resolve: publicResolver,
        maxResponseBytes: 2,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response('too large')),
      }),
    ).rejects.toThrow('超过大小限制');

    await expect(
      safeHttpRequest({
        method: 'GET',
        url: 'https://example.com',
        headers: {},
        signal: new AbortController().signal,
        resolve: publicResolver,
        maxRedirects: 0,
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response(null, { status: 302, headers: { location: '/again' } })),
      }),
    ).rejects.toThrow('重定向次数');
  });

  it('跟随通过安全校验的相对重定向', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/final' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(
      safeHttpRequest({
        method: 'POST',
        url: 'https://example.com/start',
        headers: {},
        body: 'data',
        signal: new AbortController().signal,
        resolve: publicResolver,
        fetchImpl,
      }),
    ).resolves.toMatchObject({ status: 204, body: '' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('拒绝缺少 Location 的重定向', async () => {
    await expect(
      safeHttpRequest({
        method: 'GET',
        url: 'https://example.com',
        headers: {},
        signal: new AbortController().signal,
        resolve: publicResolver,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 302 })),
      }),
    ).rejects.toThrow('缺少 Location');
  });
});
