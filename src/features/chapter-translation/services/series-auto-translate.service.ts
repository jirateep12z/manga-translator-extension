import { SetSeriesAutoTranslate } from '@/features/memory';
import { IsOwnExtensionSender } from '@/lib/extension-sender';
import { IsSetSeriesAutoTranslateMessage } from '../lib/port-message-guards';
import type { SetSeriesAutoTranslateResponse } from '../types/series-auto-translate';

// Saves a series' auto-translate setting (spec 0005 §4.2).
export function HandleSeriesAutoTranslateMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  SendResponse: (response: unknown) => void
): boolean {
  if (
    !IsSetSeriesAutoTranslateMessage(message) ||
    !IsOwnExtensionSender(sender)
  ) {
    return false;
  }

  SetSeriesAutoTranslate(message.series_id, message.is_auto_translate_enabled)
    .then(series =>
      SendResponse({
        success: true,
        is_auto_translate_enabled: series.is_auto_translate_enabled === true
      } satisfies SetSeriesAutoTranslateResponse)
    )
    .catch(() => {
      console.error('[background] set-series-auto-translate', {
        series_id: message.series_id,
        outcome: 'failed'
      });
      SendResponse({ success: false } satisfies SetSeriesAutoTranslateResponse);
    });

  return true;
}
