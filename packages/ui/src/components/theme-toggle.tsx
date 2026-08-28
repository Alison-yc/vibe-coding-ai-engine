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
  <div className="flex min-w-0 flex-col gap-3">
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-muted-foreground truncate text-xs" title={labels.appearance}>
        {labels.appearance}
      </span>
      <div className="grid min-w-0 grid-cols-3 gap-1">
        {THEME_MODES.map((mode) => (
          <Button
            key={mode}
            type="button"
            size="sm"
            variant={preference.mode === mode ? 'default' : 'outline'}
            className="min-w-0 px-2"
            aria-pressed={preference.mode === mode}
            title={labels.modes[mode]}
            onClick={() => {
              onPreferenceChange({ ...preference, mode });
            }}
          >
            {mode === 'dark' ? <Moon size={14} /> : null}
            {mode === 'light' ? <Sun size={14} /> : null}
            <span className="truncate">{labels.modes[mode]}</span>
          </Button>
        ))}
      </div>
    </div>
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-muted-foreground truncate text-xs" title={labels.palette}>
        {labels.palette}
      </span>
      <div className="grid min-w-0 grid-cols-4 gap-1">
        {THEME_PALETTES.map((palette) => (
          <Button
            key={palette}
            type="button"
            size="sm"
            variant={preference.palette === palette ? 'default' : 'outline'}
            className="min-w-0 px-2"
            aria-pressed={preference.palette === palette}
            title={labels.palettes[palette]}
            onClick={() => {
              onPreferenceChange({ ...preference, palette });
            }}
          >
            <span className="truncate">{labels.palettes[palette]}</span>
          </Button>
        ))}
      </div>
    </div>
  </div>
);
