import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import {
  assertSafeUrl,
  isPrivateAddress,
  pinnedHttpRequest,
  safeHttpRequest,
  type AddressResolver,
  type PinnedRequest,
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
    ['0:0:0:0:0:ffff:127.0.0.1', true],
    ['0:0:0:0:0:ffff:7f00:1', true],
    ['2002:7f00:1::', true],
    ['2002:0808:0808::', false],
    ['2001:0::1', true],
    ['ff02::1', true],
    ['fe80::1%lo0', true],
    ['0:0:0:0:0:ffff:0808:0808', false],
    ['2001:4860:4860::8888', false],
    ['2001:::1', true],
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
  it('原生请求器连接固定 IP 而不再次解析 URL 主机名', async () => {
    const server = createServer((request, response) => {
      response.setHeader('x-host', request.headers.host ?? '');
      response.end(request.url === '/large' ? 'too large' : 'ok');
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('测试服务器端口不可用');
    try {
      await expect(
        pinnedHttpRequest({
          url: new URL(`http://does-not-resolve.invalid:${address.port}/ok`),
          addresses: [{ address: '127.0.0.1', family: 4 }],
          method: 'GET',
          headers: {},
          signal: new AbortController().signal,
          maxResponseBytes: 100,
        }),
      ).resolves.toMatchObject({
        status: 200,
        body: 'ok',
        headers: { 'x-host': `does-not-resolve.invalid:${address.port}` },
      });
      await expect(
        pinnedHttpRequest({
          url: new URL(`http://does-not-resolve.invalid:${address.port}/large`),
          addresses: [{ address: '127.0.0.1', family: 4 }],
          method: 'GET',
          headers: {},
          signal: new AbortController().signal,
          maxResponseBytes: 2,
        }),
      ).rejects.toThrow('超过大小限制');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('返回受大小限制保护的公网响应', async () => {
    const requestImpl = vi.fn<PinnedRequest>().mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'text/plain', 'set-cookie': 'session=secret' },
      body: 'ok',
    });
    const result = await safeHttpRequest({
      method: 'GET',
      url: 'https://example.com',
      headers: {},
      signal: new AbortController().signal,
      resolve: publicResolver,
      requestImpl,
    });
    expect(result).toMatchObject({ status: 200, body: 'ok' });
    expect(result.headers).not.toHaveProperty('set-cookie');
    expect(requestImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        addresses: [{ address: '93.184.216.34', family: 4 }],
      }),
    );
  });

  it('每次重定向都重新校验并拦截跳转到内网', async () => {
    const requestImpl = vi.fn<PinnedRequest>().mockResolvedValue({
      status: 302,
      headers: { location: 'http://169.254.169.254/' },
      body: '',
    });
    await expect(
      safeHttpRequest({
        method: 'GET',
        url: 'https://example.com',
        headers: {},
        signal: new AbortController().signal,
        resolve: publicResolver,
        requestImpl,
      }),
    ).rejects.toThrow('私有或保留');
    expect(requestImpl).toHaveBeenCalledOnce();
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
        requestImpl: vi
          .fn<PinnedRequest>()
          .mockRejectedValue(new Error('HTTP 节点响应体超过大小限制')),
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
        requestImpl: vi.fn<PinnedRequest>().mockResolvedValue({
          status: 302,
          headers: { location: '/again' },
          body: '',
        }),
      }),
    ).rejects.toThrow('重定向次数');
  });

  it('跟随通过安全校验的相对重定向', async () => {
    const requestImpl = vi
      .fn<PinnedRequest>()
      .mockResolvedValueOnce({ status: 302, headers: { location: '/final' }, body: '' })
      .mockResolvedValueOnce({ status: 204, headers: {}, body: '' });
    await expect(
      safeHttpRequest({
        method: 'POST',
        url: 'https://example.com/start',
        headers: {},
        body: 'data',
        signal: new AbortController().signal,
        resolve: publicResolver,
        requestImpl,
      }),
    ).resolves.toMatchObject({ status: 204, body: '' });
    expect(requestImpl).toHaveBeenCalledTimes(2);
    expect(requestImpl).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: 'GET', body: undefined }),
    );
  });

  it('拒绝缺少 Location 的重定向', async () => {
    await expect(
      safeHttpRequest({
        method: 'GET',
        url: 'https://example.com',
        headers: {},
        signal: new AbortController().signal,
        resolve: publicResolver,
        requestImpl: vi.fn<PinnedRequest>().mockResolvedValue({
          status: 302,
          headers: {},
          body: '',
        }),
      }),
    ).rejects.toThrow('缺少 Location');
  });

  it('固定校验后的公网 IP，DNS 重绑定到内网时拒绝连接', async () => {
    const resolve = vi
      .fn<AddressResolver>()
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    const requestImpl = vi.fn<PinnedRequest>();
    await expect(
      safeHttpRequest({
        method: 'GET',
        url: 'https://example.com',
        headers: {},
        signal: new AbortController().signal,
        resolve,
        requestImpl,
      }),
    ).rejects.toThrow('私有或保留');
    expect(requestImpl).not.toHaveBeenCalled();
  });

  it('跨域重定向移除认证头并保留 307 请求体', async () => {
    const requestImpl = vi
      .fn<PinnedRequest>()
      .mockResolvedValueOnce({
        status: 307,
        headers: { location: 'https://other.example/final' },
        body: '',
      })
      .mockResolvedValueOnce({ status: 200, headers: {}, body: 'ok' });
    await safeHttpRequest({
      method: 'POST',
      url: 'https://example.com/start',
      headers: { authorization: 'Bearer secret', 'x-test': 'ok' },
      body: 'data',
      signal: new AbortController().signal,
      resolve: publicResolver,
      requestImpl,
    });
    expect(requestImpl).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'POST',
        body: 'data',
        headers: { 'x-test': 'ok' },
      }),
    );
  });

  it.each(['Host', 'content-length', 'Transfer-Encoding'])('拒绝受保护请求头 %s', async (name) => {
    await expect(
      safeHttpRequest({
        method: 'GET',
        url: 'https://example.com',
        headers: { [name]: 'invalid' },
        signal: new AbortController().signal,
        resolve: publicResolver,
        requestImpl: vi.fn<PinnedRequest>(),
      }),
    ).rejects.toThrow('不允许设置');
  });
});
