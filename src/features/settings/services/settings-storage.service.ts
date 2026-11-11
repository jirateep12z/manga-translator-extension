import { IsRecord } from '@/lib/is-record';
import { CHROME_STORAGE_KEY } from '../constants/storage';
import { MergeSettings } from '../lib/merge-settings';
import type { Settings } from '../types/settings';

export async function ReadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(CHROME_STORAGE_KEY);
  const value: unknown = stored?.[CHROME_STORAGE_KEY];

  return MergeSettings(IsRecord(value) ? (value as Partial<Settings>) : {});
}

export async function WriteSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({
    [CHROME_STORAGE_KEY]: MergeSettings(settings)
  });
}
