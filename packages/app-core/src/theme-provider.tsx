import { DEFAULT_THEME_PREFERENCE, type ThemePreference } from '@ai-engine/ui';
import { usePlatform } from '@ai-engine/platform';
import {
  createContext,
  createElement,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { applyThemeToDocument, bindThemeRuntime, persistThemePreference } from './theme-sync';

const ThemeContext = createContext<{
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
} | null>(null);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const platform = usePlatform();
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);
  const [systemTheme, setSystemTheme] = useState(() => platform.getSystemTheme());
  const [hydrated, setHydrated] = useState(false);

  useLayoutEffect(
    () =>
      bindThemeRuntime(
        platform,
        (next) => {
          setPreferenceState(next);
          setHydrated(true);
        },
        setSystemTheme,
      ),
    [platform],
  );

  useLayoutEffect(() => {
    if (!hydrated) return;
    applyThemeToDocument(preference, systemTheme);
  }, [hydrated, preference, systemTheme]);

  const value = useMemo(() => {
    const setPreference = (next: ThemePreference) => {
      setPreferenceState(next);
      applyThemeToDocument(next, systemTheme);
      void persistThemePreference(platform.kv, next);
    };
    return { preference, setPreference };
  }, [platform, preference, systemTheme]);

  return createElement(ThemeContext.Provider, { value }, children);
};

export const useTheme = () => {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme 必须在 ThemeProvider 内使用');
  }
  return value;
};
