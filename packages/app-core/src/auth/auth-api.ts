import {
  AuthSessionResponseSchema,
  MeResponseSchema,
  SendCodeResponseSchema,
  type AuthSessionResponse,
  type CodeLoginRequest,
  type MeResponse,
  type PasswordLoginRequest,
  type RegisterRequest,
  type ResetPasswordRequest,
  type SendCodeRequest,
  type SendCodeResponse,
} from '@ai-engine/contracts';
import type { Platform } from '@ai-engine/platform';
import { apiJson } from '../api/http';

const sessionHeaders = (platform: Platform): Record<string, string> =>
  platform.capabilities.client ? { 'X-Client': platform.capabilities.client } : {};

const postSession = async (
  platform: Platform,
  path: string,
  body: unknown,
  anonymous: boolean,
): Promise<AuthSessionResponse> =>
  AuthSessionResponseSchema.parse(
    await apiJson(
      platform,
      path,
      {
        method: 'POST',
        headers: sessionHeaders(platform),
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      { anonymous },
    ),
  );

/** 本地已有有效 token 时服务端会复用同一身份，不会新建访客。 */
export const issueGuestSession = (platform: Platform): Promise<AuthSessionResponse> =>
  postSession(platform, '/auth/guest', undefined, false);

/** 携带访客 token，服务端据此把访客原地升级为注册用户。 */
export const registerAccount = (
  platform: Platform,
  input: RegisterRequest,
): Promise<AuthSessionResponse> => postSession(platform, '/auth/register', input, false);

export const loginWithPassword = (
  platform: Platform,
  input: PasswordLoginRequest,
): Promise<AuthSessionResponse> => postSession(platform, '/auth/login/password', input, true);

export const loginWithCode = (
  platform: Platform,
  input: CodeLoginRequest,
): Promise<AuthSessionResponse> => postSession(platform, '/auth/login/code', input, true);

export const sendVerificationCode = async (
  platform: Platform,
  input: SendCodeRequest,
): Promise<SendCodeResponse> =>
  SendCodeResponseSchema.parse(
    await apiJson(
      platform,
      '/auth/verification-codes',
      { method: 'POST', body: JSON.stringify(input) },
      { anonymous: true },
    ),
  );

export const resetPassword = async (
  platform: Platform,
  input: ResetPasswordRequest,
): Promise<void> => {
  await apiJson(
    platform,
    '/auth/password-resets',
    { method: 'POST', body: JSON.stringify(input) },
    { anonymous: true },
  );
};

export const logoutSession = async (platform: Platform): Promise<void> => {
  await apiJson(platform, '/auth/logout', { method: 'POST' });
};

export const fetchMe = async (platform: Platform): Promise<MeResponse> =>
  MeResponseSchema.parse(await apiJson(platform, '/auth/me'));
