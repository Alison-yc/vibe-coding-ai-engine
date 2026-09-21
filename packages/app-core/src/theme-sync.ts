import { applyAppTheme } from '@ai-engine/ui';

export const applyThemeToDocument = (): void => {
  if (typeof document === 'undefined') return;
  applyAppTheme(document.documentElement);
};
