import {
  IsOwnExtensionSender,
  IsTrustedExtensionPage
} from '@/lib/extension-sender';
import { IsRecord } from '@/lib/is-record';
import {
  DEFAULT_SETTINGS,
  VALID_TARGET_LANGUAGES
} from '../constants/settings';
import { MergeSettings } from '../lib/merge-settings';
import { CreatePublicSettings } from '../lib/public-settings';
import { CreateSettingsLoadError } from '../lib/settings-load-error';
import type {
  SaveSettingsMessage,
  SaveSettingsResponse,
  UpdateTargetLanguageMessage
} from '../types/message';
import type { Settings } from '../types/settings';
import { ReadSettings, WriteSettings } from './settings-storage.service';

const NOT_ALLOWED_RESPONSE: SaveSettingsResponse = {
  success: false,
  error: 'Not allowed.'
};
const INVALID_PAYLOAD_RESPONSE: SaveSettingsResponse = {
  success: false,
  error: 'Invalid settings payload.'
};
const INVALID_TARGET_LANGUAGE_RESPONSE: SaveSettingsResponse = {
  success: false,
  error: 'Invalid target language.'
};
const SAVE_FAILED_RESPONSE: SaveSettingsResponse = {
  success: false,
  error: 'Unable to save settings. Please try again.'
};
const SUCCESS_RESPONSE: SaveSettingsResponse = { success: true };

let settings_write_chain: Promise<unknown> = Promise.resolve();

function RunSerializedSettingsWrite(
  Operation: () => Promise<void>
): Promise<void> {
  const write_promise = settings_write_chain.then(Operation, Operation);

  settings_write_chain = write_promise.catch(() => {});

  return write_promise;
}

function IsSaveSettingsMessage(
  message: Record<string, unknown>
): message is SaveSettingsMessage {
  return IsRecord(message.settings);
}

function IsUpdateTargetLanguageMessage(
  message: Record<string, unknown>
): message is UpdateTargetLanguageMessage {
  return (
    typeof message.target_language === 'string' &&
    VALID_TARGET_LANGUAGES.has(message.target_language)
  );
}

function HandleGetSettings(
  is_trusted: boolean,
  SendResponse: (response: unknown) => void
): boolean {
  const ToResponse = (settings: Settings) =>
    is_trusted ? settings : CreatePublicSettings(settings);

  ReadSettings()
    .then(settings => {
      SendResponse(ToResponse(settings));
    })
    .catch(error => {
      console.error(
        '[background] Failed to read settings from storage:',
        error
      );
      SendResponse(
        is_trusted
          ? CreateSettingsLoadError()
          : CreatePublicSettings(DEFAULT_SETTINGS)
      );
    });

  return true;
}

function HandleSaveSettings(
  message: Record<string, unknown>,
  is_trusted: boolean,
  SendResponse: (response: unknown) => void
): boolean {
  if (!is_trusted) {
    SendResponse(NOT_ALLOWED_RESPONSE);

    return false;
  }

  if (!IsSaveSettingsMessage(message)) {
    SendResponse(INVALID_PAYLOAD_RESPONSE);

    return false;
  }

  const next_settings = MergeSettings(message.settings);

  RunSerializedSettingsWrite(() => WriteSettings(next_settings))
    .then(() => {
      SendResponse(SUCCESS_RESPONSE);
    })
    .catch(error => {
      console.error('[background] Failed to save settings:', error);
      SendResponse(SAVE_FAILED_RESPONSE);
    });

  return true;
}

function HandleUpdateTargetLanguage(
  message: Record<string, unknown>,
  SendResponse: (response: unknown) => void
): boolean {
  if (!IsUpdateTargetLanguageMessage(message)) {
    SendResponse(INVALID_TARGET_LANGUAGE_RESPONSE);

    return false;
  }

  const { target_language } = message;

  RunSerializedSettingsWrite(async () => {
    const settings = await ReadSettings();

    await WriteSettings({ ...settings, target_language });
  })
    .then(() => {
      SendResponse(SUCCESS_RESPONSE);
    })
    .catch(error => {
      console.error('[background] Failed to update target language:', error);
      SendResponse(SAVE_FAILED_RESPONSE);
    });

  return true;
}

export function HandleSettingsMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  SendResponse: (response: unknown) => void
): boolean {
  if (!IsOwnExtensionSender(sender) || !IsRecord(message)) return false;

  const is_trusted = IsTrustedExtensionPage(sender);

  switch (message.action) {
    case 'get-settings':
      return HandleGetSettings(is_trusted, SendResponse);
    case 'save-settings':
      return HandleSaveSettings(message, is_trusted, SendResponse);
    case 'update-target-language':
      return HandleUpdateTargetLanguage(message, SendResponse);
    default:
      return false;
  }
}
