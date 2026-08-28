import { HealthResponseSchema, type HealthResponse } from '@ai-engine/contracts';
import { API_BASE_URL_STORAGE_KEY, type Platform } from '@ai-engine/platform';

export const normalizeApiBaseUrl = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('请输入有效的后端地址，例如 http://localhost:3000');
  }
  if (url.protocol !== 'http:') {
    throw new Error('本地后端地址必须使用 http 协议');
  }
  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('桌面端仅允许连接 localhost 或 127.0.0.1');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('后端地址只能包含协议、主机和端口');
  }
  return url.origin;
};

export const checkBackendConnection = async (baseUrl: string): Promise<HealthResponse> => {
  const normalized = normalizeApiBaseUrl(baseUrl);
  const response = await fetch(`${normalized}/health`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`后端健康检查失败：HTTP ${response.status}`);
  return HealthResponseSchema.parse(await response.json());
};

export const persistApiBaseUrl = async (platform: Platform, baseUrl: string): Promise<string> => {
  const normalized = normalizeApiBaseUrl(baseUrl);
  await platform.kv.set(API_BASE_URL_STORAGE_KEY, normalized);
  return normalized;
};
