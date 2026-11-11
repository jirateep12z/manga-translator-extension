import { IsOwnExtensionSender } from '@/lib/extension-sender';
import { IsRecord } from '@/lib/is-record';
import type { PageStatus, TabCommandResponse } from '../types/tab-messages';

export type TabCommandTarget = {
  ReadPageStatus: () => PageStatus;
  StartChapterTranslation: (is_retranslation: boolean) => boolean;
  OpenSeriesPicker: () => boolean;
};

export const EMPTY_PAGE_STATUS: PageStatus = {
  is_available: true,
  series: null,
  chapter_number: null,
  page_count: 0,
  has_cached_translations: false,
  page_url: '',
  series_page_url: null,
  queue_status: 'idle',
  is_preload_run: false
};

export function CreateTabMessageHandler(
  GetTarget: () => TabCommandTarget | null
): (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  SendResponse: (response: unknown) => void
) => boolean {
  return (message, sender, SendResponse) => {
    if (!IsOwnExtensionSender(sender) || !IsRecord(message)) return false;

    switch (message.action) {
      case 'get-page-status':
        SendResponse(GetTarget()?.ReadPageStatus() ?? EMPTY_PAGE_STATUS);
        break;
      case 'start-chapter-translation':
        if (typeof message.is_retranslation !== 'boolean') return false;

        SendResponse({
          accepted:
            GetTarget()?.StartChapterTranslation(message.is_retranslation) ??
            false
        } satisfies TabCommandResponse);
        break;
      case 'open-series-picker':
        SendResponse({
          accepted: GetTarget()?.OpenSeriesPicker() ?? false
        } satisfies TabCommandResponse);
        break;
    }

    return false;
  };
}
