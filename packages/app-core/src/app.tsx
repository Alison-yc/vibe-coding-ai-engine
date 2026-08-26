import { usePlatform } from '@ai-engine/platform';
import { BrowserRouter, HashRouter } from 'react-router';
import { AppErrorBoundary } from './components/app-error-boundary';
import { AppRoutes } from './app-routes';
import { ThemeProvider } from './theme-provider';

export const App = () => {
  const platform = usePlatform();
  const Router = platform.capabilities.routerMode === 'hash' ? HashRouter : BrowserRouter;

  return (
    <Router>
      <ThemeProvider>
        <AppErrorBoundary platform={platform}>
          <AppRoutes />
        </AppErrorBoundary>
      </ThemeProvider>
    </Router>
  );
};
