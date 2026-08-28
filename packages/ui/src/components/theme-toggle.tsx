import { Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';
import {
  THEME_MODES,
  THEME_PALETTES,
  type ThemeMode,
  type ThemePalette,
  type ThemePreference,
} from '../theme';

export type ThemeToggleLabels = {
  appearance: string;
  palette: string;
  modes: Record<ThemeMode, string>;
  palettes: Record<ThemePalette, string>;
};

export const ThemeToggle = ({
  preference,
  onPreferenceChange,
  labels,
}: {
  preference: ThemePreference;
  onPreferenceChange: (preference: ThemePreference) => void;
  labels: ThemeToggleLabels;
}) => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-sm">{labels.appearance}</span>
      {THEME_MODES.map((mode) => (
        <Button
          key={mode}
          type="button"
          size="sm"
          variant={preference.mode === mode ? 'default' : 'outline'}
          aria-pressed={preference.mode === mode}
          onClick={() => {
            onPreferenceChange({ ...preference, mode });
          }}
        >
          {mode === 'dark' ? <Moon size={16} /> : null}
          {mode === 'light' ? <Sun size={16} /> : null}
          {labels.modes[mode]}
        </Button>
      ))}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-sm">{labels.palette}</span>
      {THEME_PALETTES.map((palette) => (
        <Button
          key={palette}
          type="button"
          size="sm"
          variant={preference.palette === palette ? 'default' : 'outline'}
          aria-pressed={preference.palette === palette}
          onClick={() => {
            onPreferenceChange({ ...preference, palette });
          }}
        >
          {labels.palettes[palette]}
        </Button>
      ))}
    </div>
  </div>
);
