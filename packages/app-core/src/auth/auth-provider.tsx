import type { AuthSessionResponse } from '@ai-engine/contracts';
import { AUTH_TOKEN_STORAGE_KEY, usePlatform, type Platform } from '@ai-engine/platform';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { readAuthToken, subscribeUnauthorized } from '../api/http';
import { fetchMe, issueGuestSession, logoutSession } from './auth-api';
import { AUTH_ME_QUERY_KEY, AuthContext, type AuthContextValue } from './use-auth';

const pendingGuestIssue = new WeakMap<Platform, Promise<void>>();

/** `me` 被取消重取时旧的 queryFn 不会中止；单飞避免并发签发出多个孤儿访客。 */
const ensureSessionToken = (platform: Platform): Promise<void> => {
  const inflight = pendingGuestIssue.get(platform);
  if (inflight) return inflight;
  const task = (async () => {
    if (await readAuthToken(platform)) return;
    const session = await issueGuestSession(platform);
    await platform.secrets.set(AUTH_TOKEN_STORAGE_KEY, session.token);
  })().finally(() => pendingGuestIssue.delete(platform));
  pendingGuestIssue.set(platform, task);
  return task;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const platform = usePlatform();
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: AUTH_ME_QUERY_KEY,
    queryFn: async () => {
      await ensureSessionToken(platform);
      return fetchMe(platform);
    },
    staleTime: Infinity,
  });

  /** 身份切换后其它查询的缓存属于旧身份，全部作废；`me` 重置为加载态，避免短暂显示旧用户。 */
  const switchIdentity = useCallback(async () => {
    await queryClient.resetQueries({ queryKey: AUTH_ME_QUERY_KEY });
    await queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] !== AUTH_ME_QUERY_KEY[0],
    });
  }, [queryClient]);

  useEffect(
    () =>
      subscribeUnauthorized(platform, (rejectedToken) => {
        void (async () => {
          // 401 到达前可能已登录成新身份，只清理确实被拒的那个 token。
          if ((await readAuthToken(platform)) !== rejectedToken) return;
          await platform.secrets.remove(AUTH_TOKEN_STORAGE_KEY);
          await switchIdentity();
        })();
      }),
    [platform, switchIdentity],
  );

  const applySession = useCallback(
    async (session: AuthSessionResponse) => {
      await platform.secrets.set(AUTH_TOKEN_STORAGE_KEY, session.token);
      await switchIdentity();
    },
    [platform, switchIdentity],
  );

  const logout = useCallback(async () => {
    // 服务端不可达也要清掉本地凭证；服务端会话按 TTL 自然过期。
    await logoutSession(platform).catch(() => undefined);
    await platform.secrets.remove(AUTH_TOKEN_STORAGE_KEY);
    await switchIdentity();
  }, [platform, switchIdentity]);

  const value = useMemo<AuthContextValue>(() => {
    const data = me.data ?? null;
    return {
      status: data ? 'ready' : me.isError && !me.isFetching ? 'unavailable' : 'pending',
      me: data,
      user: data?.user ?? null,
      isRegistered: data?.user.kind === 'registered',
      applySession,
      logout,
    };
  }, [me.data, me.isError, me.isFetching, applySession, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
