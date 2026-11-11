import {
  CacheTheme,
  CHROME_STORAGE_KEY,
  DEFAULT_SETTINGS,
  MergeSettings,
  ReadCachedTheme,
  RemoveLegacySettingsCache,
  type Settings
} from '@/features/settings';
import { ApplyTheme } from '@/features/theme';
import { IsRecord } from '@/lib/is-record';

try {
  RemoveLegacySettingsCache();
  ApplyTheme(ReadCachedTheme() ?? DEFAULT_SETTINGS.theme);
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local
      .get(CHROME_STORAGE_KEY)
      .then(data => {
        const stored_settings: unknown = data?.[CHROME_STORAGE_KEY];
        const next_settings = MergeSettings(
          IsRecord(stored_settings)
            ? (stored_settings as Partial<Settings>)
            : {}
        );

        CacheTheme(next_settings.theme);
        ApplyTheme(next_settings.theme);
      })
      .catch(error => {
        console.warn('[theme-init] Failed to read stored theme:', error);
      });
  }
} catch (error) {
  console.warn('[theme-init] Failed to initialize theme:', error);
  ApplyTheme(DEFAULT_SETTINGS.theme);
}
