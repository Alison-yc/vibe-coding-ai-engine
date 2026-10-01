import { ROLE_PERMISSIONS, type AuthUser, type RoleKey } from '@ai-engine/contracts';
import { useMemo, type ReactNode } from 'react';
import { AuthContext, type AuthContextValue } from './use-auth';

/** 仅供页面测试注入固定身份，不经过 /auth/* 请求。 */
export const TestAuthProvider = ({ role, children }: { role: RoleKey; children: ReactNode }) => {
  const value = useMemo<AuthContextValue>(() => {
    const kind = role === 'guest' ? 'guest' : 'registered';
    const user: AuthUser = {
      id: '00000000-0000-4000-8000-0000000000aa',
      kind,
      displayName: kind === 'registered' ? 'Tester' : null,
      roles: [role],
      permissions: [...ROLE_PERMISSIONS[role]],
    };
    return {
      status: 'ready',
      me: { user, identities: [] },
      user,
      isRegistered: kind === 'registered',
      applySession: () => Promise.resolve(),
      logout: () => Promise.resolve(),
    };
  }, [role]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
