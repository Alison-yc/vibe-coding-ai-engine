import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@ai-engine/ui';
import type { Platform } from '@ai-engine/platform';

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
      <main className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-lg">页面发生错误</h1>
        <p className="text-muted-foreground max-w-xl text-center text-sm">
          应用遇到未捕获异常，已写入本地错误日志。你可以复制详情用于排查。
        </p>
        <pre className="bg-muted max-w-3xl overflow-auto rounded-md p-4 text-xs">
          {this.state.error.message}
        </pre>
        <div className="flex gap-2">
          <Button type="button" onClick={() => void this.copyDetails()}>
            复制错误详情
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void this.props.platform.window.reload()}
          >
            重新加载
          </Button>
        </div>
      </main>
    );
  }
}

export const ThrowForTest = ({ message }: { message: string }) => {
  throw new Error(message);
};
