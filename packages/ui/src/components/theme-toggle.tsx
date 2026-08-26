import { Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';
import {
  THEME_MODES,
  THEME_PALETTES,
  type ThemeMode,
  type ThemePalette,
  type ThemePreference,
} from '../theme';

const MODE_LABEL: Record<ThemeMode, string> = {
  light: '亮色',
  dark: '暗色',
  system: '跟随系统',
};

const PALETTE_LABEL: Record<ThemePalette, string> = {
  neutral: '默认',
  blue: '蓝',
  green: '绿',
  purple: '紫',
};

export const ThemeToggle = ({
  preference,
  onPreferenceChange,
}: {
  preference: ThemePreference;
  onPreferenceChange: (preference: ThemePreference) => void;
}) => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-sm">外观</span>
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
          {MODE_LABEL[mode]}
        </Button>
      ))}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-sm">主题色</span>
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
          {PALETTE_LABEL[palette]}
        </Button>
      ))}
    </div>
  </div>
);
