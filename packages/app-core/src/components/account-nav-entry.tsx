import { Button, LogIn, LogOut } from '@ai-engine/ui';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useOptionalAuth } from '../auth/use-auth';
import { useFeatureTranslation } from '../i18n/feature-resources';

const railButtonClassName =
  'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-auto min-w-0 flex-col gap-1 px-1 py-2';

export const AccountNavEntry = () => {
  const auth = useOptionalAuth();
  const { pathname, search } = useLocation();
  const { t } = useFeatureTranslation('auth');
  const [leaving, setLeaving] = useState(false);
  if (!auth) return null;

  if (auth.isRegistered) {
    const name =
      auth.user?.displayName ?? auth.me?.identities[0]?.identifier ?? t('account.unnamed');
    return (
      <div className="flex flex-col items-stretch gap-1" aria-label={t('account.menuLabel')}>
        <span
          className="bg-primary/15 text-primary mx-auto grid size-8 place-items-center rounded-full text-xs font-semibold"
          title={name}
          data-testid="account-avatar"
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={railButtonClassName}
          disabled={leaving}
          title={t('account.logout')}
          onClick={() => {
            setLeaving(true);
            void auth.logout().finally(() => setLeaving(false));
          }}
        >
          <LogOut className="size-5 shrink-0" aria-hidden />
          <span className="max-w-full truncate text-[10px] leading-tight">
            {t('account.logout')}
          </span>
        </Button>
      </div>
    );
  }

  const redirect = encodeURIComponent(`${pathname}${search}`);
  return (
    <Button variant="ghost" size="sm" className={railButtonClassName} asChild>
      <Link to={`/login?redirect=${redirect}`} title={t('account.login')}>
        <LogIn className="size-5 shrink-0" aria-hidden />
        <span className="max-w-full truncate text-[10px] leading-tight">{t('account.login')}</span>
      </Link>
    </Button>
  );
};
