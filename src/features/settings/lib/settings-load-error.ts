import { IsRecord } from '@/lib/is-record';

export const SETTINGS_LOAD_ERROR_MESSAGE =
  'Unable to load settings. Reopen this page to try again.';

export type SettingsLoadError = { error: string };

export function CreateSettingsLoadError(): SettingsLoadError {
  return { error: SETTINGS_LOAD_ERROR_MESSAGE };
}

export function IsSettingsLoadError(
  response: unknown
): response is SettingsLoadError {
  return IsRecord(response) && typeof response.error === 'string';
}
