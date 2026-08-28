import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@ai-engine/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { usePlatform } from '@ai-engine/platform';
import {
  checkBackendConnection,
  normalizeApiBaseUrl,
  persistApiBaseUrl,
} from '../backend-connection';

type ConnectionState = 'checking' | 'connected' | 'disconnected';

export const BackendConnectionGate = ({ children }: { children: ReactNode }) => {
  const platform = usePlatform();
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
      setError(cause instanceof Error ? cause.message : '无法连接后端服务');
      setState('disconnected');
    }
  };

  if (!required || state === 'connected') return children;

  return (
    <main className="bg-background text-foreground flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>{state === 'checking' ? '正在连接后端服务' : '无法连接到后端服务'}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <p className="text-muted-foreground text-sm">
            桌面版需要单独运行本地数据库、Ollama 和 NestJS 后端。请在项目目录依次执行：
          </p>
          <pre className="bg-muted overflow-x-auto rounded-md p-4 text-sm">
            {'pnpm dev:db\npnpm db:migrate\npnpm dev:server'}
          </pre>
          <div className="flex flex-col gap-2">
            <Label htmlFor="backend-address">后端地址</Label>
            <Input
              id="backend-address"
              value={address}
              disabled={state === 'checking'}
              placeholder="http://localhost:3000"
              onChange={(event) => setAddress(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              出于桌面端安全策略，仅支持 localhost 或 127.0.0.1，可自定义端口。
            </p>
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <div className="flex justify-end">
            <Button type="button" disabled={state === 'checking'} onClick={() => void connect()}>
              {state === 'checking' ? '正在测试…' : '保存并测试连接'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
};
