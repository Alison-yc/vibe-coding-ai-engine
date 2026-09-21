import { useLayoutEffect, type ReactNode } from 'react';
import { applyThemeToDocument } from './theme-sync';

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  useLayoutEffect(() => {
    applyThemeToDocument();
  }, []);

  return children;
};
