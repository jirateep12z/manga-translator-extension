import { ReadChapter } from '@/features/memory';
import { ListChapterPageTranslations } from '@/features/translation-cache';
import { IsOwnExtensionSender } from '@/lib/extension-sender';
import { IsGetChapterStatusMessage } from '../lib/port-message-guards';
import type {
  GetChapterStatusMessage,
  GetChapterStatusResponse
} from '../types/chapter-status';

const EMPTY_CHAPTER_STATUS: GetChapterStatusResponse = {
  cached_page_count: 0,
  chapter_status: null
};

export async function ReadChapterStatus(
  message: GetChapterStatusMessage
): Promise<GetChapterStatusResponse> {
  const [page_translations, chapter] = await Promise.all([
    ListChapterPageTranslations({
      series_id: message.series_id,
      chapter_number: message.chapter_number,
      target_language: message.target_language,
      page_hostname: message.page_hostname
    }),
    ReadChapter(message.series_id, message.chapter_number)
  ]);

  return {
    cached_page_count: page_translations.length,
    chapter_status: chapter?.status ?? null
  };
}

export function HandleChapterStatusMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  SendResponse: (response: unknown) => void
): boolean {
  if (!IsGetChapterStatusMessage(message) || !IsOwnExtensionSender(sender)) {
    return false;
  }

  ReadChapterStatus(message)
    .then(SendResponse)
    .catch(() => {
      console.error('[background] get-chapter-status', {
        series_id: message.series_id,
        chapter_number: message.chapter_number,
        outcome: 'failed'
      });
      SendResponse(EMPTY_CHAPTER_STATUS);
    });

  return true;
}
