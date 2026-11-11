import type {
  GetSettingsMessage,
  GetSettingsResponse,
  PublicSettings,
  UpdateTargetLanguageMessage
} from '@/features/settings';
import { IsOwnExtensionSender } from '@/lib/extension-sender';
import { SendRuntimeMessage } from '@/lib/messaging';
import type { TargetLanguage } from '@/types/target-language';
import { useCallback, useEffect, useState } from 'react';
import {
  IsPublicSettings,
  IsSettingsChangedMessage
} from '../lib/is-settings-changed-message';

function ToPublicSettings(settings: PublicSettings): PublicSettings {
  return {
    theme: settings.theme,
    is_enabled: settings.is_enabled,
    target_language: settings.target_language,
    reading_direction: settings.reading_direction,
    is_provider_configured: settings.is_provider_configured
  };
}

export function UsePublicSettings() {
  const [public_settings, set_public_settings] =
    useState<PublicSettings | null>(null);

  useEffect(() => {
    let is_current = true;
    const message: GetSettingsMessage = { action: 'get-settings' };

    // A settings-changed broadcast that arrives first is newer, so it wins.
    SendRuntimeMessage<GetSettingsResponse>(message)
      .then(response => {
        if (!is_current) return;

        if (!IsPublicSettings(response)) {
          console.warn('[content] get-settings', { outcome: 'invalid' });

          return;
        }

        set_public_settings(
          previous_settings => previous_settings ?? ToPublicSettings(response)
        );
      })
      .catch((error: unknown) => {
        console.warn('[content] get-settings', { outcome: 'failed', error });
      });

    const HandleMessage = (
      incoming_message: unknown,
      sender: chrome.runtime.MessageSender
    ): false => {
      if (
        IsOwnExtensionSender(sender) &&
        IsSettingsChangedMessage(incoming_message)
      ) {
        set_public_settings(ToPublicSettings(incoming_message.public_settings));
      }

      return false;
    };

    chrome.runtime.onMessage.addListener(HandleMessage);

    return () => {
      is_current = false;
      chrome.runtime.onMessage.removeListener(HandleMessage);
    };
  }, []);

  const UpdateTargetLanguage = useCallback(
    (target_language: TargetLanguage) => {
      const message: UpdateTargetLanguageMessage = {
        action: 'update-target-language',
        target_language
      };

      set_public_settings(previous_settings =>
        previous_settings ? { ...previous_settings, target_language } : null
      );
      SendRuntimeMessage(message).catch((error: unknown) => {
        console.warn('[content] update-target-language', {
          outcome: 'failed',
          error
        });
      });
    },
    []
  );

  return { public_settings, UpdateTargetLanguage };
}
