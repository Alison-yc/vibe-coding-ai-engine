import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@ai-engine/ui';
import type { Platform } from '@ai-engine/platform';
import { useFeatureTranslation } from '../i18n/feature-resources';
import { localizeApiError, type TranslateError } from '../i18n/localize-api-error';

const CLIENT_ERROR_LOG_KEY = 'client-error-log';
const MAX_CLIENT_ERRORS = 20;

export type ClientErrorReport = {
  id: string;
  message: string;
  stack?: string;
  componentStack?: string;
  recordedAt: string;
};

type AppErrorBoundaryProps = {
  platform: Platform;
  translate: TranslateError;
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
  report: ClientErrorReport | null;
};

export const appendClientErrorLog = async (
  platform: Platform,
  report: ClientErrorReport,
): Promise<void> => {
  const raw = await platform.kv.get(CLIENT_ERROR_LOG_KEY);
  let existing: ClientErrorReport[] = [];
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) existing = parsed as ClientErrorReport[];
    } catch {
      existing = [];
    }
  }
  const next = [report, ...existing].slice(0, MAX_CLIENT_ERRORS);
  await platform.kv.set(CLIENT_ERROR_LOG_KEY, JSON.stringify(next));
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: null, report: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error, report: null };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const report: ClientErrorReport = {
      id: crypto.randomUUID(),
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
      recordedAt: new Date().toISOString(),
    };
    this.setState({ report });
    void appendClientErrorLog(this.props.platform, report);
    if (this.props.platform.capabilities.devTools) {
      console.error('[AppErrorBoundary]', report);
    }
  }

  private copyDetails = async (): Promise<void> => {
    const report = this.state.report;
    if (!report) return;
    const payload = JSON.stringify(report, null, 2);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
      return;
    }
    console.info(payload);
  };

  override render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="bg-background text-foreground flex min-h-screen min-w-0 flex-col items-center justify-center gap-4 p-6">
        <h1 className="line-clamp-2 max-w-xl text-center text-lg">
          {this.props.translate('boundary.title')}
        </h1>
        <p className="text-muted-foreground line-clamp-4 max-w-xl text-center text-sm">
          {this.props.translate('boundary.description')}
        </p>
        <pre className="bg-muted w-full max-w-3xl min-w-0 overflow-auto rounded-md p-4 text-xs">
          {localizeApiError(this.state.error, this.props.translate)}
        </pre>
        <div className="flex max-w-full min-w-0 gap-2">
          <Button className="min-w-0" type="button" onClick={() => void this.copyDetails()}>
            <span className="truncate">{this.props.translate('boundary.copyDetails')}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-w-0"
            onClick={() => void this.props.platform.window.reload()}
          >
            <span className="truncate">{this.props.translate('boundary.reload')}</span>
          </Button>
        </div>
      </main>
    );
  }
}

export const LocalizedAppErrorBoundary = ({
  platform,
  children,
}: Omit<AppErrorBoundaryProps, 'translate'>) => {
  const { t } = useFeatureTranslation('errors');
  return (
    <AppErrorBoundary platform={platform} translate={t}>
      {children}
    </AppErrorBoundary>
  );
};

export const ThrowForTest = ({ message }: { message: string }) => {
  throw new Error(message);
};
