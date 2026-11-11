import type { Theme } from '@/features/theme';
import { VALID_THEMES } from '@/features/theme';
import { IsRecord } from '@/lib/is-record';
import {
  LEGACY_LOCAL_STORAGE_KEY,
  THEME_CACHE_STORAGE_KEY
} from '../constants/storage';

function RemoveThemeCache(): void {
  try {
    localStorage.removeItem(THEME_CACHE_STORAGE_KEY);
  } catch {}
}

export function ReadCachedTheme(): Theme | null {
  try {
    const raw_cache = localStorage.getItem(THEME_CACHE_STORAGE_KEY);

    if (raw_cache === null) return null;
    try {
      const parsed_cache: unknown = JSON.parse(raw_cache);

      if (
        IsRecord(parsed_cache) &&
        typeof parsed_cache.theme === 'string' &&
        VALID_THEMES.has(parsed_cache.theme)
      ) {
        return parsed_cache.theme as Theme;
      }
    } catch {}

    RemoveThemeCache();

    return null;
  } catch {
    return null;
  }
}

export function CacheTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_CACHE_STORAGE_KEY, JSON.stringify({ theme }));
  } catch (error) {
    console.warn('[settings] Failed to cache theme:', error);
  }
}

export function RemoveLegacySettingsCache(): void {
  try {
    localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
  } catch {}
}
