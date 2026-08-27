import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
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

const isPrivateIpv6 = (address: string): boolean => {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  const mappedDotted = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedDotted) return isPrivateIpv4(mappedDotted);
  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!mappedHex) return false;
  const high = Number.parseInt(mappedHex[1] ?? '', 16);
  const low = Number.parseInt(mappedHex[2] ?? '', 16);
  return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
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
  fetchImpl?: typeof fetch;
};

export type SafeHttpResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

const isReadResult = (value: unknown): value is { done: boolean; value?: Uint8Array } =>
  typeof value === 'object' &&
  value !== null &&
  'done' in value &&
  typeof value.done === 'boolean' &&
  (!('value' in value) || value.value === undefined || value.value instanceof Uint8Array);

const readLimitedBody = async (response: Response, maxBytes: number): Promise<string> => {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk: unknown = await reader.read();
      if (!isReadResult(chunk)) throw new Error('HTTP 节点响应流格式不合法');
      if (chunk.done) break;
      if (!chunk.value) continue;
      size += chunk.value.byteLength;
      if (size > maxBytes) throw new Error('HTTP 节点响应体超过大小限制');
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
};

export const safeHttpRequest = async (options: SafeHttpOptions): Promise<SafeHttpResult> => {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxResponseBytes = options.maxResponseBytes ?? 1_000_000;
  const maxRedirects = options.maxRedirects ?? 5;
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]);
  let current = await assertSafeUrl(options.url, options.resolve);

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const response = await fetchImpl(current, {
      method: options.method,
      headers: options.headers,
      body: options.method === 'GET' ? undefined : options.body,
      redirect: 'manual',
      signal,
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('HTTP 重定向缺少 Location');
      if (redirect === maxRedirects) throw new Error('HTTP 重定向次数超过限制');
      current = await assertSafeUrl(new URL(location, current).toString(), options.resolve);
      continue;
    }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await readLimitedBody(response, maxResponseBytes),
    };
  }
  throw new Error('HTTP 请求未完成');
};
