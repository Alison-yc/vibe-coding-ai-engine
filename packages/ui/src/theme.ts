export const THEME_PALETTES = ['neutral', 'blue', 'green', 'purple'] as const;
export type ThemePalette = (typeof THEME_PALETTES)[number];

export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const THEME_STORAGE_KEY = 'theme-preference';

export type ThemePreference = {
  palette: ThemePalette;
  mode: ThemeMode;
};

export const DEFAULT_THEME_PREFERENCE: ThemePreference = {
  palette: 'neutral',
  mode: 'system',
};

export const isThemePalette = (value: unknown): value is ThemePalette =>
  typeof value === 'string' && (THEME_PALETTES as readonly string[]).includes(value);

export const isThemeMode = (value: unknown): value is ThemeMode =>
  typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value);

export const parseThemePreference = (raw: string | null): ThemePreference => {
  if (!raw) return DEFAULT_THEME_PREFERENCE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_THEME_PREFERENCE;
    const palette = 'palette' in parsed ? parsed.palette : undefined;
    const mode = 'mode' in parsed ? parsed.mode : undefined;
    if (!isThemePalette(palette) || !isThemeMode(mode)) return DEFAULT_THEME_PREFERENCE;
    return { palette, mode };
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
};

export const serializeThemePreference = (preference: ThemePreference): string =>
  JSON.stringify(preference);

export const resolveAppearance = (
  mode: ThemeMode,
  systemTheme: 'light' | 'dark',
): 'light' | 'dark' => (mode === 'system' ? systemTheme : mode);

export const applyDocumentTheme = (
  root: {
    classList: { toggle: (token: string, force?: boolean) => void };
    setAttribute: (name: string, value: string) => void;
    removeAttribute: (name: string) => void;
  },
  palette: ThemePalette,
  appearance: 'light' | 'dark',
): void => {
  if (palette === 'neutral') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', palette);
  }
  root.classList.toggle('dark', appearance === 'dark');
};
