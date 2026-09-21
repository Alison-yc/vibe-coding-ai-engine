import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@ai-engine/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { usePlatform } from '@ai-engine/platform';
import {
  checkBackendConnection,
  localizeBackendConnectionError,
  normalizeApiBaseUrl,
  persistApiBaseUrl,
} from '../backend-connection';
import { useFeatureTranslation } from '../i18n/feature-resources';

type ConnectionState = 'checking' | 'connected' | 'disconnected';

export const BackendConnectionGate = ({ children }: { children: ReactNode }) => {
  const platform = usePlatform();
  const { t } = useFeatureTranslation('settings');
  const required = platform.capabilities.backendConnectionSetup === true;
  const [address, setAddress] = useState(() => platform.getApiBaseUrl());
  const [state, setState] = useState<ConnectionState>(required ? 'checking' : 'connected');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!required) return;
    let active = true;
    void checkBackendConnection(platform.getApiBaseUrl())
      .then(() => {
        if (active) setState('connected');
      })
      .catch(() => {
        if (active) setState('disconnected');
      });
    return () => {
      active = false;
    };
  }, [platform, required]);

  const connect = async () => {
    setState('checking');
    setError(null);
    try {
      const normalized = normalizeApiBaseUrl(address);
      await checkBackendConnection(normalized);
      await persistApiBaseUrl(platform, normalized);
      setAddress(normalized);
      setState('connected');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? localizeBackendConnectionError(cause, t)
          : t('connectionGate.fallbackError'),
      );
      setState('disconnected');
    }
  };

  if (!required || state === 'connected') return children;

  return (
    <main className="bg-background text-foreground flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-xl min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="line-clamp-2">
            {state === 'checking'
              ? t('connectionGate.checkingTitle')
              : t('connectionGate.disconnectedTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-5">
          <p className="text-muted-foreground line-clamp-4 text-sm">
            {t('connectionGate.description')}
          </p>
          <pre className="bg-muted overflow-x-auto rounded-md p-4 text-sm">
            {'pnpm dev:db\npnpm db:migrate\npnpm dev:server'}
          </pre>
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="backend-address">{t('connectionGate.addressLabel')}</Label>
            <Input
              id="backend-address"
              value={address}
              disabled={state === 'checking'}
              placeholder="http://localhost:3000"
              onChange={(event) => setAddress(event.target.value)}
            />
            <p className="text-muted-foreground line-clamp-3 text-xs">
              {t('connectionGate.localOnlyDescription')}
            </p>
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <div className="flex min-w-0 justify-end">
            <Button
              type="button"
              className="min-w-0"
              disabled={state === 'checking'}
              onClick={() => void connect()}
            >
              <span className="truncate">
                {state === 'checking'
                  ? t('connectionGate.testing')
                  : t('connectionGate.saveAndTest')}
              </span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
};
