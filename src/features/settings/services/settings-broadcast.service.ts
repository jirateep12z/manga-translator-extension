import { IsRecord } from '@/lib/is-record';
import { CHROME_STORAGE_AREA, CHROME_STORAGE_KEY } from '../constants/storage';
import { MergeSettings } from '../lib/merge-settings';
import { CreatePublicSettings } from '../lib/public-settings';
import type { SettingsChangedMessage } from '../types/message';
import type { PublicSettings, Settings } from '../types/settings';

function ToPublicSettings(value: unknown): PublicSettings {
  return CreatePublicSettings(
    MergeSettings(IsRecord(value) ? (value as Partial<Settings>) : {})
  );
}

async function SendToAllTabs(message: SettingsChangedMessage): Promise<void> {
  const tabs = await chrome.tabs.query({});

  await Promise.all(
    tabs
      .filter(tab => typeof tab.id === 'number')
      .map(tab =>
        chrome.tabs.sendMessage(tab.id as number, message).catch(() => {})
      )
  );
}

export function BroadcastPublicSettingsChange(
  changes: { [key: string]: chrome.storage.StorageChange },
  area_name: string
): void {
  const settings_change = changes[CHROME_STORAGE_KEY];

  if (area_name !== CHROME_STORAGE_AREA || !settings_change) return;

  const previous_public_settings = ToPublicSettings(settings_change.oldValue);
  const next_public_settings = ToPublicSettings(settings_change.newValue);

  if (
    JSON.stringify(previous_public_settings) ===
    JSON.stringify(next_public_settings)
  ) {
    return;
  }

  void SendToAllTabs({
    action: 'settings-changed',
    public_settings: next_public_settings
  }).catch(error => {
    console.error('[background] Failed to broadcast settings change:', error);
  });
}
