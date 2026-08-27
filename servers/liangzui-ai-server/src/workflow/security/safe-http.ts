import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

export type AddressResolver = (hostname: string) => Promise<LookupAddress[]>;

const defaultResolver: AddressResolver = (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

const isPrivateIpv4 = (address: string): boolean => {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  if (a === undefined || b === undefined) return true;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
};

const parseIpv6 = (address: string): number[] | null => {
  const normalized = address
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .split('%')[0];
  if (!normalized) return null;
  const convertDotted = (parts: string[]): string[] => {
    const last = parts.at(-1);
    if (!last?.includes('.')) return parts;
    const bytes = last.split('.').map(Number);
    if (
      bytes.length !== 4 ||
      bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
    ) {
      return [];
    }
    return [
      ...parts.slice(0, -1),
      ((bytes[0] ?? 0) * 256 + (bytes[1] ?? 0)).toString(16),
      ((bytes[2] ?? 0) * 256 + (bytes[3] ?? 0)).toString(16),
    ];
  };
  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = convertDotted(halves[0] ? halves[0].split(':') : []);
  const right = convertDotted(halves[1] ? halves[1].split(':') : []);
  if (left.length === 0 && halves[0]) return null;
  if (right.length === 0 && halves[1]) return null;
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const segments = [...left, ...Array.from({ length: missing }, () => '0'), ...right].map((part) =>
    Number.parseInt(part, 16),
  );
  if (
    segments.length !== 8 ||
    segments.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)
  ) {
    return null;
  }
  return segments;
};

const embeddedIpv4 = (high: number, low: number): string =>
  `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;

const isPrivateIpv6 = (address: string): boolean => {
  const segments = parseIpv6(address);
  if (!segments) return true;
  const [first = 0, second = 0] = segments;
  if (segments.every((part) => part === 0) || segments.slice(0, 7).every((part) => part === 0)) {
    return true;
  }
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80) return true;
  if ((first & 0xff00) === 0xff00) return true;
  if (first === 0x2001 && second === 0) return true;
  if (first === 0x2002) return isPrivateIpv4(embeddedIpv4(segments[1] ?? 0, segments[2] ?? 0));
  const mapped = segments.slice(0, 5).every((part) => part === 0) && (segments[5] ?? 0) === 0xffff;
  return mapped ? isPrivateIpv4(embeddedIpv4(segments[6] ?? 0, segments[7] ?? 0)) : false;
};

export const isPrivateAddress = (address: string): boolean => {
  const version = isIP(address.replace(/^\[|\]$/g, ''));
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
};

export const assertSafeUrl = async (
  value: string,
  resolve: AddressResolver = defaultResolver,
): Promise<URL> => {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error('HTTP 节点 URL 不合法', { cause: error });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('HTTP 节点仅允许 http/https 协议');
  }
  if (url.username || url.password) throw new Error('HTTP 节点 URL 不允许携带凭据');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await resolve(hostname);
  if (addresses.length === 0) throw new Error('HTTP 节点目标域名无法解析');
  if (addresses.some((item) => isPrivateAddress(item.address))) {
    throw new Error('HTTP 节点禁止访问私有或保留网络地址');
  }
  return url;
};

type SafeTarget = { url: URL; addresses: LookupAddress[] };

const resolveSafeTarget = async (
  value: string,
  resolve: AddressResolver = defaultResolver,
): Promise<SafeTarget> => {
  const url = await assertSafeUrl(value, resolve);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await resolve(hostname);
  if (addresses.length === 0 || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new Error('HTTP 节点禁止访问私有或保留网络地址');
  }
  return { url, addresses };
};

export type PinnedRequest = (input: {
  url: URL;
  addresses: LookupAddress[];
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal: AbortSignal;
  maxResponseBytes: number;
}) => Promise<SafeHttpResult>;

export type SafeHttpOptions = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  signal: AbortSignal;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
  resolve?: AddressResolver;
  requestImpl?: PinnedRequest;
};

export type SafeHttpResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export const pinnedHttpRequest: PinnedRequest = (input) =>
  new Promise((resolve, reject) => {
    const address = input.addresses[0];
    if (!address) {
      reject(new Error('HTTP 节点目标域名无法解析'));
      return;
    }
    const request = (input.url.protocol === 'https:' ? httpsRequest : httpRequest)(
      input.url,
      {
        method: input.method,
        headers: input.headers,
        signal: input.signal,
        lookup: (_hostname, _options, callback) => {
          if (_options.all) callback(null, input.addresses);
          else callback(null, address.address, address.family);
        },
      },
      (response) => {
        const chunks: Uint8Array[] = [];
        let size = 0;
        let exceededLimit = false;
        response.on('data', (chunk: Buffer) => {
          if (exceededLimit) return;
          size += chunk.byteLength;
          if (size > input.maxResponseBytes) {
            exceededLimit = true;
            reject(new Error('HTTP 节点响应体超过大小限制'));
            response.destroy();
            request.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          if (exceededLimit) return;
          const headers = Object.fromEntries(
            Object.entries(response.headers).flatMap(([name, value]) =>
              value === undefined ? [] : [[name, Array.isArray(value) ? value.join(', ') : value]],
            ),
          );
          resolve({
            status: response.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    request.on('error', reject);
    if (input.body !== undefined) request.write(input.body);
    request.end();
  });

export const safeHttpRequest = async (options: SafeHttpOptions): Promise<SafeHttpResult> => {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxResponseBytes = options.maxResponseBytes ?? 1_000_000;
  const maxRedirects = options.maxRedirects ?? 5;
  const requestImpl = options.requestImpl ?? pinnedHttpRequest;
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]);
  let current = options.url;
  let method = options.method;
  let body = options.body;
  let headers = { ...options.headers };
  const forbiddenHeaders = new Set(['host', 'content-length', 'transfer-encoding']);
  if (Object.keys(headers).some((name) => forbiddenHeaders.has(name.toLowerCase()))) {
    throw new Error('HTTP 节点不允许设置 Host、Content-Length 或 Transfer-Encoding');
  }

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const target = await resolveSafeTarget(current, options.resolve);
    const response = await requestImpl({
      url: target.url,
      addresses: target.addresses,
      method,
      headers,
      body: method === 'GET' ? undefined : body,
      signal,
      maxResponseBytes,
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (!location) throw new Error('HTTP 重定向缺少 Location');
      if (redirect === maxRedirects) throw new Error('HTTP 重定向次数超过限制');
      const next = new URL(location, target.url);
      if (next.origin !== target.url.origin) {
        headers = Object.fromEntries(
          Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'authorization'),
        );
      }
      if ([301, 302, 303].includes(response.status) && method !== 'GET') {
        method = 'GET';
        body = undefined;
      }
      current = next.toString();
      continue;
    }
    const sensitiveResponseHeaders = new Set([
      'set-cookie',
      'proxy-authenticate',
      'www-authenticate',
    ]);
    return {
      ...response,
      headers: Object.fromEntries(
        Object.entries(response.headers).filter(
          ([name]) => !sensitiveResponseHeaders.has(name.toLowerCase()),
        ),
      ),
    };
  }
  throw new Error('HTTP 请求未完成');
};
