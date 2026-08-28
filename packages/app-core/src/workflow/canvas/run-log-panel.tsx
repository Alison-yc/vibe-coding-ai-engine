import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Badge, Button } from '@ai-engine/ui';
import { useTranslation } from 'react-i18next';
import { useWorkflowStore } from '../store/workflow-store';
import type { RuntimeLog } from '../types';

export const RunLogPanel = ({
  logs,
  open,
  onToggle,
}: {
  logs: RuntimeLog[];
  open: boolean;
  onToggle: () => void;
}) => {
  const { t } = useTranslation('workflow');
  const parentRef = useRef<HTMLDivElement>(null);
  // TanStack Virtual 有意返回可变测量函数；组件不把这些函数传给 memo 子组件。
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 92,
    overscan: 4,
  });
  return (
    <section className="border-border bg-card border-t">
      <header className="flex h-11 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-sm font-semibold">{t('logs.title')}</h2>
          <Badge variant="secondary">{logs.length}</Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={onToggle}>
          {open ? t('logs.collapse') : t('logs.expand')}
        </Button>
      </header>
      {open ? (
        <div ref={parentRef} className="h-56 overflow-auto">
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const log = logs[item.index];
              if (!log) return null;
              return (
                <div
                  key={log.id}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className="absolute top-0 left-0 w-full px-4 pb-2"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <details
                    className="border-border bg-background rounded-md border p-3"
                    open={log.status === 'running' || Boolean(log.text) || Boolean(log.error)}
                  >
                    <summary className="flex cursor-pointer items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm">
                        {log.titleKey ? t(log.titleKey) : log.title}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {log.elapsedMs !== undefined ? (
                          <span className="text-muted-foreground text-xs">{log.elapsedMs}ms</span>
                        ) : null}
                        <Badge variant={log.status === 'failed' ? 'destructive' : 'secondary'}>
                          {t(`status.${log.status}`)}
                        </Badge>
                      </span>
                    </summary>
                    {log.text ? (
                      <pre className="bg-muted mt-2 max-h-32 overflow-auto rounded p-2 text-xs whitespace-pre-wrap">
                        {log.text}
                      </pre>
                    ) : null}
                    {log.error ? (
                      <p className="text-destructive mt-2 text-xs">{log.error}</p>
                    ) : null}
                    {log.inputs ? (
                      <pre className="text-muted-foreground mt-2 overflow-auto text-xs">
                        {t('logs.input', { value: JSON.stringify(log.inputs, null, 2) })}
                      </pre>
                    ) : null}
                    {log.outputs ? (
                      <pre className="text-muted-foreground mt-2 overflow-auto text-xs">
                        {t('logs.output', { value: JSON.stringify(log.outputs, null, 2) })}
                      </pre>
                    ) : null}
                  </details>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export const WorkflowRunLogPanel = ({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) => {
  const logs = useWorkflowStore((state) => state.logs);
  return <RunLogPanel logs={logs} open={open} onToggle={onToggle} />;
};
