import { usePlatform } from '@ai-engine/platform';
import { BrowserRouter, HashRouter } from 'react-router';
import { AppRoutes } from './app-routes';

export const App = () => {
  const platform = usePlatform();
  const Router = platform.capabilities.routerMode === 'hash' ? HashRouter : BrowserRouter;

  return (
    <Router>
      <AppRoutes />
    </Router>
  );
};
