import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button, Separator } from '@ai-engine/ui';

export const PageShell = ({
  title,
  description,
  backTo,
  backLabel = '返回',
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
}) => (
  <main className="bg-background text-foreground mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 p-6">
    {nav ? (
      <nav className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">{nav}</nav>
    ) : null}
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-2">
        {backTo ? (
          <Link
            to={backTo}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
          >
            ← {backLabel}
          </Link>
        ) : null}
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
    <Separator />
    <div className="flex flex-col gap-6">{children}</div>
  </main>
);

export const AppNavLinks = () => (
  <>
    <Button variant="ghost" size="sm" asChild>
      <Link to="/chat">对话</Link>
    </Button>
    <Button variant="ghost" size="sm" asChild>
      <Link to="/knowledge">知识库</Link>
    </Button>
    <Button variant="ghost" size="sm" asChild>
      <Link to="/settings">设置</Link>
    </Button>
  </>
);

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
