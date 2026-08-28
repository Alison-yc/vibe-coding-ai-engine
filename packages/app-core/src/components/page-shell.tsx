import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button, Separator } from '@ai-engine/ui';

export const PageShell = ({
  title,
  description,
  backTo,
  backLabel,
  actions,
  nav,
  children,
}: {
  title: string;
  description?: string;
  backTo?: string;
  backLabel?: string;
  actions?: ReactNode;
  nav?: ReactNode;
  children: ReactNode;
}) => {
  const { t } = useTranslation();
  return (
    <main className="bg-background text-foreground mx-auto flex min-h-dvh w-full max-w-5xl min-w-0 flex-col gap-6 p-6">
      {nav ? (
        <nav
          data-testid="app-nav"
          className="text-muted-foreground flex w-full flex-nowrap items-center gap-1 overflow-hidden text-sm sm:gap-3"
        >
          {nav}
        </nav>
      ) : null}
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
              <p className="text-muted-foreground line-clamp-3 max-w-3xl text-sm">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex min-w-0 flex-wrap gap-2">{actions}</div> : null}
      </header>
      <Separator />
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
    </main>
  );
};

export const AppNavLinks = () => {
  const { t } = useTranslation();
  const links = [
    ['/chat', t('nav.chat')],
    ['/knowledge', t('nav.knowledge')],
    ['/workflow', t('nav.workflow')],
    ['/settings', t('nav.settings')],
  ] as const;
  return links.map(([to, label]) => (
    <Button key={to} variant="ghost" size="sm" className="max-w-36 min-w-0 flex-1" asChild>
      <Link to={to} title={label}>
        <span className="truncate">{label}</span>
      </Link>
    </Button>
  ));
};

export const EmptyState = ({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) => (
  <div className="border-border bg-muted/30 flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
    <p className="text-base font-medium">{title}</p>
    <p className="text-muted-foreground max-w-md text-sm">{description}</p>
    {action}
  </div>
);
