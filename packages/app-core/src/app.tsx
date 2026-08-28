import { usePlatform } from '@ai-engine/platform';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BrowserRouter, HashRouter } from 'react-router';
import { AppErrorBoundary } from './components/app-error-boundary';
import { BackendConnectionGate } from './components/backend-connection-gate';
import { AppRoutes } from './app-routes';
import { ThemeProvider } from './theme-provider';

export const App = () => {
  const platform = usePlatform();
  const Router = platform.capabilities.routerMode === 'hash' ? HashRouter : BrowserRouter;
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <ThemeProvider>
          <AppErrorBoundary platform={platform}>
            <BackendConnectionGate>
              <AppRoutes />
            </BackendConnectionGate>
          </AppErrorBoundary>
        </ThemeProvider>
      </Router>
    </QueryClientProvider>
  );
};
