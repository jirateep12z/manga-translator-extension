import type { PageStatus } from '@/features/chapter-translation';
import type { Settings, TargetLanguage } from '@/features/settings';
import type { Theme } from '@/features/theme';

export type SettingsPanelProps = {
  theme: Theme;
  is_enabled: boolean;
  OnEnabledChange: (value: boolean) => void;
  OnOpenFullSettings: () => void;
  OnThemeChange: (theme: Theme) => void;
};

export type TranslatePanelProps = {
  settings: Settings;
  tab_id: number | null;
  status: PageStatus;
  is_loading: boolean;
  OnTargetLanguageChange: (target_language: TargetLanguage) => void;
};
