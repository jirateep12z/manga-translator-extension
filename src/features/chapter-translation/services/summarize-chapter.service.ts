import { FinalizeChapter } from '@/features/translation-pipeline';
import { ToErrorCode } from '@/lib/app-error';
import { IsTrustedExtensionPage } from '@/lib/extension-sender';
import { IsSummarizeChapterMessage } from '../lib/port-message-guards';
import type { SummarizeChapterResponse } from '../types/summarize-chapter';

export function HandleSummarizeChapterMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  SendResponse: (response: unknown) => void
): boolean {
  if (!IsSummarizeChapterMessage(message) || !IsTrustedExtensionPage(sender)) {
    return false;
  }

  FinalizeChapter({
    series_id: message.series_id,
    chapter_number: message.chapter_number,
    is_forced: true,
    signal: new AbortController().signal
  })
    .then(() =>
      SendResponse({ success: true } satisfies SummarizeChapterResponse)
    )
    .catch(error => {
      const error_code = ToErrorCode(error);

      console.error('[background] summarize-chapter', {
        series_id: message.series_id,
        chapter_number: message.chapter_number,
        outcome: 'failed',
        error_code
      });
      SendResponse({
        success: false,
        error_code
      } satisfies SummarizeChapterResponse);
    });

  return true;
}
