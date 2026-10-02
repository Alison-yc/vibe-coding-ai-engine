import type { AuthSessionResponse, AuthUser, MeResponse, Permission } from '@ai-engine/contracts';
import { createContext, useContext } from 'react';

export const AUTH_ME_QUERY_KEY = ['auth', 'me'] as const;

export type AuthStatus = 'pending' | 'ready' | 'unavailable';

export type AuthContextValue = {
  readonly status: AuthStatus;
  readonly me: MeResponse | null;
  readonly user: AuthUser | null;
  readonly isRegistered: boolean;
  readonly applySession: (session: AuthSessionResponse) => Promise<void>;
  readonly logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export const useOptionalAuth = (): AuthContextValue | null => useContext(AuthContext);

export const useAuth = (): AuthContextValue => {
  const auth = useOptionalAuth();
  if (!auth) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return auth;
};

export const useCan = (permission: Permission): boolean =>
  useOptionalAuth()?.user?.permissions.includes(permission) ?? false;
