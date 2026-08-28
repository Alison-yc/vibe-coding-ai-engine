import { usePlatform } from '@ai-engine/platform';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BrowserRouter, HashRouter } from 'react-router';
import { LocalizedAppErrorBoundary } from './components/app-error-boundary';
import { BackendConnectionGate } from './components/backend-connection-gate';
import { AppI18nProvider } from './i18n/i18n-provider';
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
          <AppI18nProvider>
            <LocalizedAppErrorBoundary platform={platform}>
              <BackendConnectionGate>
                <AppRoutes />
              </BackendConnectionGate>
            </LocalizedAppErrorBoundary>
          </AppI18nProvider>
        </ThemeProvider>
      </Router>
    </QueryClientProvider>
  );
};
