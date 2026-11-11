import { IsOwnExtensionSender } from '@/lib/extension-sender';
import { IsRecord } from '@/lib/is-record';
import { IsChapterPreloadStatusMessage } from '../lib/chapter-preload-guards';
import type {
  ChapterPreloadResponse,
  PreloadCommandTarget,
  PreloadStartResponse
} from '../types/chapter-preload';

// Routes the background's preload commands to the page (spec 0006 §6.2).
export function CreatePreloadTabMessageHandler(
  GetTarget: () => PreloadCommandTarget | null
): (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  SendResponse: (response: unknown) => void
) => boolean {
  return (message, sender, SendResponse) => {
    if (!IsOwnExtensionSender(sender) || !IsRecord(message)) return false;

    switch (message.action) {
      case 'go-to-next-chapter':
        SendResponse({
          accepted: GetTarget()?.GoToNextChapter() ?? false
        } satisfies ChapterPreloadResponse);
        break;
      case 'start-preload-translation': {
        const target = GetTarget();

        if (target === null) {
          SendResponse({ accepted: false } satisfies PreloadStartResponse);
          break;
        }

        const refusal = target.StartPreloadTranslation();

        SendResponse(
          (refusal === null
            ? { accepted: true }
            : {
                accepted: false,
                reason: refusal
              }) satisfies PreloadStartResponse
        );
        break;
      }

      case 'release-preload-tab': {
        const target = GetTarget();

        target?.ReleasePreloadTab();
        SendResponse({
          accepted: target !== null
        } satisfies ChapterPreloadResponse);
        break;
      }

      case 'chapter-preload-status': {
        if (!IsChapterPreloadStatusMessage(message)) return false;

        const target = GetTarget();

        target?.ShowPreloadStatus(message.status);
        SendResponse({
          accepted: target !== null
        } satisfies ChapterPreloadResponse);
        break;
      }
    }

    return false;
  };
}
