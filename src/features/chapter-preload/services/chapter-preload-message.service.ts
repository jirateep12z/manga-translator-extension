import { IsOwnExtensionSender } from '@/lib/extension-sender';
import {
  IsCancelChapterPreloadMessage,
  IsGetPreloadTabRoleMessage,
  IsRequestChapterPreloadMessage
} from '../lib/chapter-preload-guards';
import type {
  ChapterPreloadResponse,
  PreloadTabRoleResponse
} from '../types/chapter-preload';
import type { ChapterPreloadManager } from './chapter-preload-session.service';

type RuntimeMessageHandler = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  SendResponse: (response: unknown) => void
) => boolean;

function Respond(
  pending_result: Promise<boolean>,
  SendResponse: (response: unknown) => void
): void {
  pending_result
    .then(accepted =>
      SendResponse({ accepted } satisfies ChapterPreloadResponse)
    )
    .catch(() =>
      SendResponse({ accepted: false } satisfies ChapterPreloadResponse)
    );
}

// Handles request-chapter-preload and cancel-chapter-preload (spec 0006
// §6.1). The source tab and its URL come from the sender, not the message.
export function CreateChapterPreloadMessageHandler(
  manager: ChapterPreloadManager
): RuntimeMessageHandler {
  return (message, sender, SendResponse) => {
    if (!IsOwnExtensionSender(sender)) return false;

    if (IsRequestChapterPreloadMessage(message)) {
      const source_tab = sender.tab;

      if (
        typeof source_tab?.id !== 'number' ||
        typeof source_tab.windowId !== 'number' ||
        typeof source_tab.url !== 'string'
      ) {
        SendResponse({ accepted: false } satisfies ChapterPreloadResponse);

        return false;
      }

      Respond(
        manager.RequestPreload({
          series_id: message.series_id,
          chapter_number: message.chapter_number,
          source_tab_id: source_tab.id,
          source_window_id: source_tab.windowId,
          source_url: source_tab.url
        }),
        SendResponse
      );

      return true;
    }

    if (IsGetPreloadTabRoleMessage(message)) {
      const sender_tab = sender.tab;

      if (
        typeof sender_tab?.id !== 'number' ||
        typeof sender_tab.windowId !== 'number'
      ) {
        SendResponse({
          is_preload_tab: false
        } satisfies PreloadTabRoleResponse);

        return false;
      }

      manager
        .IsPreloadTab(sender_tab.id, sender_tab.windowId)
        .catch(() => false)
        .then(is_preload_tab =>
          SendResponse({ is_preload_tab } satisfies PreloadTabRoleResponse)
        );

      return true;
    }

    if (IsCancelChapterPreloadMessage(message)) {
      Respond(
        manager.CancelPreload(message.series_id, sender.tab?.windowId ?? null),
        SendResponse
      );

      return true;
    }

    return false;
  };
}
