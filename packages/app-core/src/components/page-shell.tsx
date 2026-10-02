import type { Permission } from '@ai-engine/contracts';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  AppMark,
  BookOpen,
  Button,
  CardTitle,
  GitBranch,
  Lock,
  MessageSquare,
  Separator,
  Settings,
  cn,
} from '@ai-engine/ui';
import { loginPathFor } from '../auth/require-permission';
import { useOptionalAuth } from '../auth/use-auth';
import { useFeatureTranslation } from '../i18n/feature-resources';
import { AccountNavEntry } from './account-nav-entry';

type AppNavItem = {
  readonly to: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
  readonly labelKey: 'nav.chat' | 'nav.knowledge' | 'nav.workflow' | 'nav.settings';
  readonly permission?: Permission;
};

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  { to: '/chat', icon: MessageSquare, labelKey: 'nav.chat' },
  { to: '/knowledge', icon: BookOpen, labelKey: 'nav.knowledge', permission: 'knowledge:read' },
  { to: '/workflow', icon: GitBranch, labelKey: 'nav.workflow', permission: 'workflow:read' },
  { to: '/settings', icon: Settings, labelKey: 'nav.settings' },
];

export const IconCardTitle = ({
  icon: Icon,
  children,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  children: ReactNode;
}) => (
  <CardTitle className="flex min-w-0 items-center gap-2">
    <Icon className="text-primary size-5 shrink-0" aria-hidden />
    <span className="line-clamp-2 min-w-0">{children}</span>
  </CardTitle>
);

export const AppNavRail = () => {
  const { t } = useTranslation();
  const { t: authT } = useFeatureTranslation('auth');
  const { pathname } = useLocation();
  const auth = useOptionalAuth();
  const granted = auth?.user?.permissions ?? [];
  const isLocked = (permission?: Permission) =>
    permission !== undefined && auth?.status === 'ready' && !granted.includes(permission);

  return (
    <nav
      aria-label={t('nav.primary')}
      data-testid="app-nav-rail"
      className="bg-sidebar text-sidebar-foreground border-sidebar-border flex w-[4.25rem] shrink-0 flex-col items-stretch gap-1 border-r px-2 py-4"
    >
      <div className="mb-3 flex justify-center">
        <Link
          to="/chat"
          className="rounded-lg transition-opacity duration-150 hover:opacity-90"
          title={t('nav.brand')}
          aria-label={t('nav.brand')}
        >
          <AppMark size={40} />
        </Link>
      </div>
      {APP_NAV_ITEMS.map(({ to, icon: Icon, labelKey, permission }) => {
        const active = pathname === to || pathname.startsWith(`${to}/`);
        const label = t(labelKey);
        const locked = isLocked(permission);
        return (
          <Button
            key={to}
            variant="ghost"
            size="sm"
            className={cn(
              'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-auto min-w-0 flex-col gap-1 px-1 py-2',
              active && 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold',
            )}
            asChild
          >
            <Link
              to={locked ? loginPathFor(to) : to}
              title={locked ? authT('gate.lockedNav', { label }) : label}
              aria-current={active ? 'page' : undefined}
              data-locked={locked || undefined}
            >
              <span className="relative">
                <Icon
                  className={cn(
                    'size-5 shrink-0',
                    active && 'text-primary',
                    locked && 'text-muted-foreground',
                  )}
                  aria-hidden
                />
                {locked ? (
                  <Lock
                    className="bg-sidebar text-muted-foreground absolute -right-1.5 -bottom-1 size-3 rounded-full"
                    aria-hidden
                  />
                ) : null}
              </span>
              <span className="max-w-full truncate text-[10px] leading-tight">{label}</span>
            </Link>
          </Button>
        );
      })}
      <div className="mt-auto flex flex-col items-stretch">
        <AccountNavEntry />
      </div>
    </nav>
  );
};

export const AppLayout = ({ children }: { children: ReactNode }) => (
  <div className="bg-background text-foreground flex h-dvh min-h-0 overflow-hidden">
    <AppNavRail />
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
  </div>
);

export const PageShell = ({
  title,
  description,
  backTo,
  backLabel,
  actions,
  children,
}: {
  title: string;
  description?: string;
  backTo?: string;
  backLabel?: string;
  actions?: ReactNode;
  children: ReactNode;
}) => {
  const { t } = useTranslation();
  return (
    <AppLayout>
      <main className="motion-safe-fade-in mx-auto flex min-h-0 w-full max-w-6xl min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
        <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            {backTo ? (
              <Link
                to={backTo}
                className="text-muted-foreground hover:text-foreground inline-flex min-w-0 items-center gap-1 text-sm transition-colors"
              >
                ← {backLabel ?? t('shell.back')}
              </Link>
            ) : null}
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="line-clamp-2 min-h-7 text-lg font-semibold tracking-tight">{title}</h1>
              {description ? (
                <p className="text-muted-foreground line-clamp-3 max-w-3xl text-sm">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex min-w-0 flex-wrap gap-2">{actions}</div> : null}
        </header>
        <Separator />
        <div className="flex min-w-0 flex-col gap-6">{children}</div>
      </main>
    </AppLayout>
  );
};

export const EmptyState = ({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}) => (
  <div className="border-border bg-muted/40 flex flex-col items-center gap-4 rounded-lg border border-dashed px-6 py-12 text-center">
    {Icon ? (
      <span className="bg-primary/10 text-primary grid size-14 place-items-center rounded-2xl">
        <Icon className="size-7" aria-hidden />
      </span>
    ) : null}
    <div className="flex flex-col gap-2">
      <p className="text-base font-medium">{title}</p>
      <p className="text-muted-foreground max-w-md text-sm">{description}</p>
    </div>
    {action}
  </div>
);
