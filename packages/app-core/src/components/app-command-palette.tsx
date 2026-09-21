import { Button, Input } from '@ai-engine/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { APP_NAV_ITEMS } from './page-shell';

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

export const AppCommandPalette = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const items = useMemo(
    () =>
      APP_NAV_ITEMS.map((item) => ({
        ...item,
        label: t(item.labelKey),
      })),
    [t],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (item) => item.label.toLowerCase().includes(needle) || item.to.toLowerCase().includes(needle),
    );
  }, [items, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        if (isEditableTarget(event.target)) return;
        event.preventDefault();
        setOpen((current) => !current);
        setQuery('');
        return;
      }
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <button
        type="button"
        aria-label={t('commandPalette.close')}
        className="bg-background/70 motion-safe-fade-in absolute inset-0"
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('commandPalette.title')}
        className="border-border bg-popover text-popover-foreground motion-safe-scale-in relative z-10 w-full max-w-md overflow-hidden rounded-lg border shadow-md"
      >
        <div className="border-border border-b p-3">
          <Input
            autoFocus
            value={query}
            placeholder={t('commandPalette.placeholder')}
            aria-label={t('commandPalette.placeholder')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <ul className="max-h-64 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <li className="text-muted-foreground px-2 py-3 text-sm">{t('commandPalette.empty')}</li>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full min-w-0 justify-start gap-2 px-2 py-2"
                    onClick={() => {
                      void navigate(item.to);
                      close();
                    }}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{item.label}</span>
                  </Button>
                </li>
              );
            })
          )}
        </ul>
        <p className="text-muted-foreground border-border border-t px-3 py-2 text-xs">
          {t('commandPalette.hint')}
        </p>
      </div>
    </div>
  );
};
