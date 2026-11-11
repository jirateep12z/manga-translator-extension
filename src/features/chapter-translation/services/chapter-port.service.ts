import {
  FinalizeChapter,
  ProcessTranslatePage,
  WARM_UP_PAGE_INDEX,
  WarmUpPipelineModels
} from '@/features/translation-pipeline';
import { ToErrorCode } from '@/lib/app-error';
import { IsOwnExtensionSender } from '@/lib/extension-sender';
import { CHAPTER_TRANSLATION_PORT_NAME } from '../constants/port';
import { IsChapterPortRequest } from '../lib/port-message-guards';
import type {
  ChapterPortResponse,
  FinalizeChapterPortMessage,
  TranslatePagePortMessage
} from '../types/port-messages';

type PortSession = {
  tab_id: number;
  window_id: number;
  page_controllers: Map<number, AbortController>;
  session_controller: AbortController;
  PostResponse: (response: ChapterPortResponse) => void;
};

async function RunTranslatePage(
  session: PortSession,
  message: TranslatePagePortMessage
): Promise<void> {
  const { action: _action, ...job } = message;
  const { page_index } = job;
  const started_at_ms = Date.now();
  const controller = new AbortController();

  session.page_controllers.get(page_index)?.abort();
  session.page_controllers.set(page_index, controller);

  try {
    const result = await ProcessTranslatePage(job, {
      tab_id: session.tab_id,
      window_id: session.window_id,
      signal: controller.signal,
      OnCaptureDone: () =>
        session.PostResponse({ action: 'capture-done', page_index })
    });

    session.PostResponse({ action: 'page-result', ...result });
    console.info('[background] translate-page', {
      series_id: job.series_id,
      chapter_number: job.chapter_number,
      page_index,
      is_cache_only: job.is_cache_only,
      duration_ms: Date.now() - started_at_ms,
      outcome: result.outcome
    });
  } catch (error) {
    const error_code = ToErrorCode(error);

    session.PostResponse({ action: 'page-error', page_index, error_code });

    // A page missing from the cache is expected in a cache-only run.
    if (error_code === 'NOT_CACHED') {
      console.info('[background] translate-page', {
        series_id: job.series_id,
        chapter_number: job.chapter_number,
        page_index,
        is_cache_only: job.is_cache_only,
        duration_ms: Date.now() - started_at_ms,
        outcome: 'not_cached'
      });

      return;
    }

    // chrome://extensions prints objects as [object Object], so the error
    // code is also part of the message text.
    console.error(`[background] translate-page failed: ${error_code}`, {
      series_id: job.series_id,
      chapter_number: job.chapter_number,
      page_index,
      is_cache_only: job.is_cache_only,
      duration_ms: Date.now() - started_at_ms,
      outcome: 'failed',
      error_code
    });
  } finally {
    if (session.page_controllers.get(page_index) === controller) {
      session.page_controllers.delete(page_index);
    }
  }
}

async function RunWarmUp(session: PortSession): Promise<void> {
  try {
    await WarmUpPipelineModels(session.session_controller.signal);
    session.PostResponse({ action: 'warm-up-done' });
  } catch (error) {
    session.PostResponse({
      action: 'page-error',
      page_index: WARM_UP_PAGE_INDEX,
      error_code: ToErrorCode(error)
    });
  }
}

async function RunFinalizeChapter(
  session: PortSession,
  message: FinalizeChapterPortMessage
): Promise<void> {
  try {
    const was_summarized = await FinalizeChapter({
      series_id: message.series_id,
      chapter_number: message.chapter_number,
      is_forced: false,
      signal: session.session_controller.signal
    });

    session.PostResponse({ action: 'chapter-finalized', was_summarized });
  } catch (error) {
    const error_code = ToErrorCode(error);

    console.error(`[background] finalize-chapter failed: ${error_code}`, {
      series_id: message.series_id,
      chapter_number: message.chapter_number,
      outcome: 'failed',
      error_code
    });
    session.PostResponse({
      action: 'chapter-finalized',
      was_summarized: false
    });
  }
}

function HandlePortMessage(session: PortSession, message: unknown): void {
  if (!IsChapterPortRequest(message)) return;

  switch (message.action) {
    case 'translate-page':
      void RunTranslatePage(session, message);
      break;
    case 'cancel-page':
      session.page_controllers.get(message.page_index)?.abort();
      break;
    case 'warm-up':
      void RunWarmUp(session);
      break;
    case 'finalize-chapter':
      void RunFinalizeChapter(session, message);
      break;
  }
}

export function HandleChapterTranslationPort(port: chrome.runtime.Port): void {
  if (port.name !== CHAPTER_TRANSLATION_PORT_NAME) return;

  const tab_id = port.sender?.tab?.id;
  const window_id = port.sender?.tab?.windowId;
  const is_allowed_sender =
    port.sender !== undefined && IsOwnExtensionSender(port.sender);

  if (!is_allowed_sender || tab_id === undefined || window_id === undefined) {
    port.disconnect();

    return;
  }

  let is_connected = true;
  const session: PortSession = {
    tab_id,
    window_id,
    page_controllers: new Map(),
    session_controller: new AbortController(),
    PostResponse: response => {
      if (!is_connected) return;

      try {
        port.postMessage(response);
      } catch {
        is_connected = false;
      }
    }
  };

  port.onMessage.addListener(message => HandlePortMessage(session, message));
  port.onDisconnect.addListener(() => {
    is_connected = false;

    for (const controller of session.page_controllers.values()) {
      controller.abort();
    }

    session.session_controller.abort();
  });
}
