import { AUTH_TOKEN_STORAGE_KEY, type Platform } from '@ai-engine/platform';
import { createApiRequestError } from './api-error';

export type ApiFetchOptions = {
  /** 登录类接口的 401 表示凭证错误而非会话失效，不能携带 token，也不能触发失效处理。 */
  readonly anonymous?: boolean;
};

type UnauthorizedListener = (rejectedToken: string) => void;

const unauthorizedListeners = new WeakMap<Platform, Set<UnauthorizedListener>>();

export const subscribeUnauthorized = (
  platform: Platform,
  listener: UnauthorizedListener,
): (() => void) => {
  const listeners = unauthorizedListeners.get(platform) ?? new Set<UnauthorizedListener>();
  unauthorizedListeners.set(platform, listeners);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const readAuthToken = (platform: Platform): Promise<string | null> =>
  platform.secrets.get(AUTH_TOKEN_STORAGE_KEY);

export const apiFetch = async (
  platform: Platform,
  path: string,
  init: RequestInit = {},
  options: ApiFetchOptions = {},
): Promise<Response> => {
  const headers = new Headers(init.headers);
  if (
    init.body !== undefined &&
    init.body !== null &&
    !(init.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }
  const token = options.anonymous ? null : await readAuthToken(platform);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const baseUrl = platform.getApiBaseUrl().replace(/\/$/, '');
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  if (response.status === 401 && token) {
    for (const listener of unauthorizedListeners.get(platform) ?? []) listener(token);
  }
  return response;
};

export const readJsonBody = async (response: Response): Promise<unknown> => {
  try {
    return (await response.json()) as unknown;
  } catch {
    return {};
  }
};

export const apiJson = async (
  platform: Platform,
  path: string,
  init?: RequestInit,
  options?: ApiFetchOptions,
): Promise<unknown> => {
  const response = await apiFetch(platform, path, init, options);
  const data = await readJsonBody(response);
  if (!response.ok) {
    throw createApiRequestError(data, response.status);
  }
  return data;
};
