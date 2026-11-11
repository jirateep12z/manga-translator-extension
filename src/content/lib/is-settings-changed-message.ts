import {
  VALID_READING_DIRECTIONS,
  VALID_TARGET_LANGUAGES,
  type PublicSettings,
  type SettingsChangedMessage
} from '@/features/settings';
import { VALID_THEMES } from '@/features/theme';
import { IsRecord } from '@/lib/is-record';

export function IsPublicSettings(value: unknown): value is PublicSettings {
  return (
    IsRecord(value) &&
    typeof value.theme === 'string' &&
    VALID_THEMES.has(value.theme) &&
    typeof value.is_enabled === 'boolean' &&
    typeof value.is_provider_configured === 'boolean' &&
    typeof value.target_language === 'string' &&
    VALID_TARGET_LANGUAGES.has(value.target_language) &&
    typeof value.reading_direction === 'string' &&
    VALID_READING_DIRECTIONS.has(value.reading_direction)
  );
}

export function IsSettingsChangedMessage(
  message: unknown
): message is SettingsChangedMessage {
  return (
    IsRecord(message) &&
    message.action === 'settings-changed' &&
    IsPublicSettings(message.public_settings)
  );
}
