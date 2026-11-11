import type { PublicSettings, Settings, TargetLanguage } from './settings';

export type GetSettingsMessage = {
  action: 'get-settings';
};

export type SaveSettingsMessage = {
  action: 'save-settings';
  settings: Partial<Settings>;
};

export type UpdateTargetLanguageMessage = {
  action: 'update-target-language';
  target_language: TargetLanguage;
};

export type SettingsChangedMessage = {
  action: 'settings-changed';
  public_settings: PublicSettings;
};

export type IncomingSettingsMessage =
  GetSettingsMessage | SaveSettingsMessage | UpdateTargetLanguageMessage;

export type GetSettingsResponse = Settings | PublicSettings;

export type SaveSettingsResponse =
  | {
      success: true;
    }
  | {
      success: false;
      error: string;
    };
