import type { AuthClient } from './auth.repository';
import { USER_AGENT_MAX } from './auth.constants';

export type AuthRequestMeta = {
  token?: string;
  client: AuthClient;
  userAgent: string | null;
};

const headerValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export const readBearer = (value: string | string[] | undefined): string | undefined => {
  const header = headerValue(value)?.trim();
  if (!header) return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1];
};

export const readClient = (value: string | string[] | undefined): AuthClient =>
  headerValue(value) === 'desktop' ? 'desktop' : 'web';

export const readUserAgent = (value: string | string[] | undefined): string | null => {
  const header = headerValue(value);
  if (!header) return null;
  return header.slice(0, USER_AGENT_MAX);
};

export const readAuthRequestMeta = (
  authorization: string | string[] | undefined,
  userAgent: string | string[] | undefined,
  client: string | string[] | undefined,
): AuthRequestMeta => ({
  token: readBearer(authorization),
  client: readClient(client),
  userAgent: readUserAgent(userAgent),
});
