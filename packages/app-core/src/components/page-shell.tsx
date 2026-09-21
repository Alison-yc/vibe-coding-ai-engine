import type { ComponentType, ReactNode, SVGProps } from 'react';
import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Button,
  CardTitle,
  GitBranch,
  MessageSquare,
  Separator,
  Settings,
  cn,
} from '@ai-engine/ui';
export const APP_NAV_ITEMS = [
  { to: '/chat', icon: MessageSquare, labelKey: 'nav.chat' as const },
  { to: '/knowledge', icon: BookOpen, labelKey: 'nav.knowledge' as const },
  { to: '/workflow', icon: GitBranch, labelKey: 'nav.workflow' as const },
  { to: '/settings', icon: Settings, labelKey: 'nav.settings' as const },
] as const;

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
  const { pathname } = useLocation();

  return (
    <nav
      aria-label={t('nav.primary')}
      data-testid="app-nav-rail"
      className="bg-sidebar text-sidebar-foreground border-sidebar-border flex w-[4.25rem] shrink-0 flex-col items-stretch gap-1 border-r px-2 py-4"
    >
      <div className="mb-3 flex justify-center">
        <span
          aria-hidden
          className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-lg text-xs font-bold tracking-tight"
        >
          LZ
        </span>
      </div>
      {APP_NAV_ITEMS.map(({ to, icon: Icon, labelKey }) => {
        const active = pathname === to || pathname.startsWith(`${to}/`);
        const label = t(labelKey);
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
            <Link to={to} title={label} aria-current={active ? 'page' : undefined}>
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className="max-w-full truncate text-[10px] leading-tight">{label}</span>
            </Link>
          </Button>
        );
      })}
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
      <main className="mx-auto flex min-h-0 w-full max-w-6xl min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
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
