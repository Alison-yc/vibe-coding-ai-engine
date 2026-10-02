import type { Permission } from '@ai-engine/contracts';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useFeatureTranslation } from '../i18n/feature-resources';
import { useCan, useOptionalAuth } from './use-auth';

export const loginPathFor = (target: string): string =>
  `/login?redirect=${encodeURIComponent(target)}`;

/** 只决定显示什么；真正的拒绝在服务端，前端放行不代表请求会成功。 */
export const RequirePermission = ({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) => {
  const auth = useOptionalAuth();
  const allowed = useCan(permission);
  const { pathname, search } = useLocation();
  const { t } = useFeatureTranslation('auth');
  if (allowed) return children;
  if (auth?.status === 'pending' || auth?.status === 'unavailable') {
    return (
      <main className="bg-background text-foreground min-h-dvh p-6" role="status">
        {auth.status === 'pending' ? t('gate.checking') : t('unavailable')}
      </main>
    );
  }
  return <Navigate to={loginPathFor(`${pathname}${search}`)} replace />;
};
