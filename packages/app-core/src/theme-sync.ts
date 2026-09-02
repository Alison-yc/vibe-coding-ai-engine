import {
  applyDocumentTheme,
  parseThemePreference,
  resolveAppearance,
  serializeThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '@ai-engine/ui';
import type { Platform } from '@ai-engine/platform';

export const applyThemeToDocument = (
  preference: ThemePreference,
  systemTheme: 'light' | 'dark',
): void => {
  if (typeof document === 'undefined') return;
  applyDocumentTheme(
    document.documentElement,
    preference.palette,
    resolveAppearance(preference.mode, systemTheme),
  );
};

export const persistThemePreference = (
  kv: Platform['kv'],
  preference: ThemePreference,
): Promise<void> => kv.set(THEME_STORAGE_KEY, serializeThemePreference(preference));

export const bindThemeRuntime = (
  platform: Platform,
  onPreference: (preference: ThemePreference) => void,
  onSystemTheme: (theme: 'light' | 'dark') => void,
): (() => void) => {
  let cancelled = false;
  const unsubscribe = platform.subscribeSystemTheme((theme) => {
    if (!cancelled) onSystemTheme(theme);
  });
  void platform.kv.get(THEME_STORAGE_KEY).then((raw) => {
    if (cancelled) return;
    const stored = parseThemePreference(raw);
    onPreference(stored);
    applyThemeToDocument(stored, platform.getSystemTheme());
  });
  return () => {
    cancelled = true;
    unsubscribe();
  };
};
