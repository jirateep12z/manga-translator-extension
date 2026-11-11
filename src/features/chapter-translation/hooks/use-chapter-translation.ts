import type { PageScanner, ScannedPage } from '@/features/page-scanner';
import { SendRuntimeMessage } from '@/lib/messaging';
import { WaitAnimationFrames } from '@/lib/wait-animation-frames';
import type { TargetLanguage } from '@/types/target-language';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { CAPTURE_RESTORE_TIMEOUT_MS } from '../constants/queue';
import {
  CreateCacheStatusKey,
  ReadCachedPageCount,
  type CacheStatus
} from '../lib/cache-status-key';
import { IsFullyInViewport } from '../lib/capture-geometry';
import {
  ChapterQueueReducer,
  CreateInitialQueueState,
  SelectNextJob
} from '../lib/chapter-queue-reducer';
import { CreateStaleReplyCounter } from '../lib/stale-reply-counter';
import {
  CreateChapterPortClient,
  type ChapterPortClient
} from '../services/chapter-port-client.service';
import { ResolveImageSource } from '../services/image-source-reader.service';
import type {
  GetChapterStatusMessage,
  GetChapterStatusResponse
} from '../types/chapter-status';
import type {
  ChapterPortRequest,
  ChapterPortResponse
} from '../types/port-messages';
import type { QueueState } from '../types/queue';
import type { SeriesState } from '../types/series-state';

export type PageResult = Extract<
  ChapterPortResponse,
  { action: 'page-result' }
>;

type ActiveSend = {
  send_id: number;
  page_index: number;
  is_posted?: boolean;
};

type ReplyOrigin = 'active' | 'canceled-this-run' | 'canceled-earlier-run';

type UseChapterTranslationInput = {
  scanner: PageScanner;
  pages: readonly ScannedPage[];
  series_state: SeriesState | null;
  target_language: TargetLanguage;
  page_hostname: string;
  page_url: string;
  SetHostHidden: (is_hidden: boolean) => void;
};

function FindFirstVisiblePosition(
  scanner: PageScanner,
  pages: readonly ScannedPage[]
): number {
  const position = pages.findIndex(page => {
    const rect = scanner.GetElement(page.page_id)?.getBoundingClientRect();

    return rect !== undefined && rect.bottom > 0 && rect.top < innerHeight;
  });

  return Math.max(0, position);
}

export function UseChapterTranslation(input: UseChapterTranslationInput) {
  const [queue_state, Dispatch] = useReducer(
    ChapterQueueReducer,
    input.target_language,
    CreateInitialQueueState
  );
  // Results are keyed by page_id because a new run can reindex pages.
  const [page_results, set_page_results] = useState<
    ReadonlyMap<string, PageResult>
  >(() => new Map());
  // Stored with the key it was read for, so a chapter change reads it as
  // unknown until the new chapter's status arrives (spec 0005 §7.2).
  const [cache_status, set_cache_status] = useState<CacheStatus | null>(null);
  const [status_refresh_count, set_status_refresh_count] = useState(0);
  const [stale_reply_counter] = useState(CreateStaleReplyCounter);
  const input_ref = useRef(input);
  const queue_state_ref = useRef<QueueState>(queue_state);
  const capture_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capture_page_index_ref = useRef<number | null>(null);
  const port_client_ref = useRef<ChapterPortClient | null>(null);
  const previous_status_ref = useRef(queue_state.status);
  // The send in progress. Render state lags behind dispatches, so async send
  // steps compare against this ref instead of queue_state_ref.
  const active_send_ref = useRef<ActiveSend | null>(null);
  const send_sequence_ref = useRef(0);
  const run_id_ref = useRef(0);

  input_ref.current = input;
  queue_state_ref.current = queue_state;

  const RestoreHost = useCallback(() => {
    if (capture_timer_ref.current !== null) {
      clearTimeout(capture_timer_ref.current);
      capture_timer_ref.current = null;
    }

    capture_page_index_ref.current = null;
    input_ref.current.SetHostHidden(false);
  }, []);

  const ForgetOutstandingSends = useCallback(() => {
    active_send_ref.current = null;
    stale_reply_counter.Clear();
  }, [stale_reply_counter]);

  // Classifies a reply: it answers the active send, a request canceled in
  // this run, or a request canceled before the current run started.
  const SettleReply = useCallback(
    (page_index: number): ReplyOrigin => {
      const stale_run_id = stale_reply_counter.Consume(page_index);

      if (stale_run_id !== null) {
        return stale_run_id === run_id_ref.current
          ? 'canceled-this-run'
          : 'canceled-earlier-run';
      }

      if (active_send_ref.current?.page_index === page_index) {
        active_send_ref.current = null;
      }

      return 'active';
    },
    [stale_reply_counter]
  );

  const HandlePortMessage = useCallback(
    (message: ChapterPortResponse) => {
      switch (message.action) {
        case 'page-result': {
          if (capture_page_index_ref.current === message.page_index) {
            RestoreHost();
          }

          // A result from an earlier run may belong to a reindexed page, and
          // it must not skip a requested retranslation.
          if (SettleReply(message.page_index) === 'canceled-earlier-run') {
            break;
          }

          const page_id = queue_state_ref.current.jobs.find(
            job => job.page_index === message.page_index
          )?.page_id;

          if (page_id !== undefined) {
            set_page_results(previous_results =>
              new Map(previous_results).set(page_id, message)
            );
          }

          Dispatch({
            type: 'PAGE_RESULT',
            page_index: message.page_index,
            outcome: message.outcome
          });
          break;
        }

        case 'page-error':
          if (capture_page_index_ref.current === message.page_index) {
            RestoreHost();
          }

          if (SettleReply(message.page_index) !== 'active') break;

          Dispatch({
            type: 'PAGE_ERROR',
            page_index: message.page_index,
            error_code: message.error_code
          });
          break;
        case 'warm-up-done':
          Dispatch({ type: 'WARM_UP_DONE' });
          break;
        case 'capture-done':
          RestoreHost();
          break;
        case 'chapter-finalized':
          set_status_refresh_count(count => count + 1);
          break;
      }
    },
    [RestoreHost, SettleReply]
  );

  const HandlePortLost = useCallback(() => {
    ForgetOutstandingSends();
    Dispatch({ type: 'PORT_DISCONNECTED' });
    RestoreHost();
  }, [ForgetOutstandingSends, RestoreHost]);

  const GetPortClient = useCallback((): ChapterPortClient => {
    port_client_ref.current ??= CreateChapterPortClient({
      OnMessage: HandlePortMessage,
      OnUnexpectedDisconnect: HandlePortLost
    });

    return port_client_ref.current;
  }, [HandlePortMessage, HandlePortLost]);

  // Posting throws when the extension context is invalidated (for example,
  // after an update). That is handled like a lost port.
  const SafePost = useCallback(
    (message: ChapterPortRequest): boolean => {
      try {
        GetPortClient().Post(message);

        return true;
      } catch (error) {
        console.warn('[content] chapter-port post', {
          action: message.action,
          outcome: 'failed',
          error
        });

        try {
          port_client_ref.current?.Disconnect();
        } catch {
          // The port is already unusable.
        }

        HandlePortLost();

        return false;
      }
    },
    [GetPortClient, HandlePortLost]
  );

  useEffect(
    () => () => {
      port_client_ref.current?.Disconnect();
      ForgetOutstandingSends();
      RestoreHost();
    },
    [ForgetOutstandingSends, RestoreHost]
  );

  const next_job = SelectNextJob(queue_state);

  useEffect(() => {
    if (!next_job) return;

    const { scanner, pages, page_url, page_hostname, SetHostHidden } =
      input_ref.current;
    const sent_state = queue_state_ref.current;
    const page_index = next_job.page_index;
    const active_send: ActiveSend = {
      send_id: ++send_sequence_ref.current,
      page_index
    };
    const IsStillInFlight = () => active_send_ref.current === active_send;

    active_send_ref.current = active_send;
    Dispatch({ type: 'PAGE_SENT', page_index });

    const element = scanner.GetElement(next_job.page_id);
    const scanned_page = pages.find(page => page.page_id === next_job.page_id);

    if (!element || !scanned_page) {
      active_send_ref.current = null;
      Dispatch({
        type: 'PAGE_ERROR',
        page_index,
        error_code: 'IMAGE_FETCH_FAILED'
      });

      return;
    }

    void (async () => {
      const image_source = await ResolveImageSource({
        effective_source: scanned_page.effective_source,
        referrer_policy: element.referrerPolicy,
        use_capture: next_job.use_capture,
        viewport_rect: element.getBoundingClientRect(),
        device_pixel_ratio: window.devicePixelRatio
      }).catch(() => null);

      if (!IsStillInFlight()) return;

      if (!image_source) {
        active_send_ref.current = null;
        Dispatch({
          type: 'PAGE_ERROR',
          page_index,
          error_code: 'IMAGE_FETCH_FAILED'
        });

        return;
      }

      if (image_source.type === 'capture') {
        SetHostHidden(true);
        capture_page_index_ref.current = page_index;
        capture_timer_ref.current = setTimeout(
          RestoreHost,
          CAPTURE_RESTORE_TIMEOUT_MS
        );
        await WaitAnimationFrames(2);

        if (!IsStillInFlight()) {
          RestoreHost();

          return;
        }
      }

      active_send.is_posted = SafePost({
        action: 'translate-page',
        series_id: sent_state.series_id ?? '',
        chapter_number: sent_state.chapter_number ?? '',
        page_index,
        page_url,
        page_hostname,
        image_source,
        target_language: sent_state.target_language,
        is_retranslation: sent_state.is_retranslation,
        is_cache_only: sent_state.is_cache_only
      });
    })();
  }, [next_job, SafePost, RestoreHost]);

  const page_ids_key = input.pages.map(page => page.page_id).join('\n');

  useEffect(() => {
    const { status } = queue_state_ref.current;

    if (status !== 'translating' && status !== 'paused') return;

    Dispatch({
      type: 'PAGES_FOUND',
      page_ids: input_ref.current.pages.map(page => page.page_id)
    });
  }, [page_ids_key]);

  useEffect(() => {
    const previous_status = previous_status_ref.current;

    previous_status_ref.current = queue_state.status;

    const is_newly_completed =
      queue_state.status === 'completed' && previous_status !== 'completed';

    // A cache-only or preload run never finalizes (spec 0005 §6.2, spec 0006
    // §4.1).
    if (
      !is_newly_completed ||
      queue_state.is_cache_only ||
      queue_state.is_preload ||
      queue_state.series_id === null ||
      queue_state.chapter_number === null
    ) {
      return;
    }

    SafePost({
      action: 'finalize-chapter',
      series_id: queue_state.series_id,
      chapter_number: queue_state.chapter_number
    });
  }, [
    queue_state.status,
    queue_state.is_cache_only,
    queue_state.is_preload,
    queue_state.series_id,
    queue_state.chapter_number,
    SafePost
  ]);

  const bound_series_id =
    input.series_state?.status === 'bound'
      ? input.series_state.series_id
      : null;
  const bound_chapter_number =
    input.series_state?.status === 'bound'
      ? input.series_state.chapter_number
      : null;

  const current_cache_key =
    bound_series_id === null || bound_chapter_number === null
      ? null
      : CreateCacheStatusKey({
          series_id: bound_series_id,
          chapter_number: bound_chapter_number,
          target_language: input.target_language,
          page_hostname: input.page_hostname,
          refresh_count: status_refresh_count
        });
  const cached_page_count = ReadCachedPageCount(
    cache_status,
    current_cache_key
  );
  const has_cached_translations =
    cached_page_count !== null && cached_page_count > 0;

  useEffect(() => {
    if (
      current_cache_key === null ||
      bound_series_id === null ||
      bound_chapter_number === null
    ) {
      return;
    }

    let is_current = true;
    const message: GetChapterStatusMessage = {
      action: 'get-chapter-status',
      series_id: bound_series_id,
      chapter_number: bound_chapter_number,
      target_language: input.target_language,
      page_hostname: input.page_hostname
    };

    SendRuntimeMessage<GetChapterStatusResponse>(message)
      .then(response => {
        if (is_current) {
          set_cache_status({
            key: current_cache_key,
            cached_page_count: response.cached_page_count
          });
        }
      })
      .catch(() => {
        if (is_current) {
          set_cache_status({ key: current_cache_key, cached_page_count: 0 });
        }
      });

    return () => {
      is_current = false;
    };
  }, [
    current_cache_key,
    bound_series_id,
    bound_chapter_number,
    input.target_language,
    input.page_hostname
  ]);

  // A canceled request still gets one reply from the background. It is
  // marked stale so that the reply cannot touch a later send of that page.
  const CancelInFlightPage = useCallback(() => {
    const active_send = active_send_ref.current;

    active_send_ref.current = null;

    if (!active_send) return;

    if (capture_page_index_ref.current === active_send.page_index) {
      RestoreHost();
    }

    if (!active_send.is_posted) return;

    stale_reply_counter.Mark(active_send.page_index, run_id_ref.current);
    SafePost({ action: 'cancel-page', page_index: active_send.page_index });
  }, [RestoreHost, SafePost, stale_reply_counter]);

  // The caller passes the series it just bound, because input_ref holds the
  // series from the last render until React renders again.
  const Start = useCallback(
    (
      is_retranslation: boolean,
      series_state: SeriesState | null = input_ref.current.series_state,
      is_cache_only = false,
      is_preload = false
    ) => {
      const { scanner, target_language } = input_ref.current;
      // Read from the scanner, not the last render, so pages found by a
      // rescan just before the start are included.
      const pages = scanner.GetPages();

      if (series_state?.status !== 'bound' || pages.length === 0) return;

      const { status, is_cache_only: is_running_cache_only } =
        queue_state_ref.current;

      if (status === 'translating' || status === 'paused') {
        // Only a full run may replace a cache-only run (spec 0005 §6.2).
        if (!is_running_cache_only || is_cache_only) return;

        CancelInFlightPage();
      }

      run_id_ref.current++;
      Dispatch({
        type: 'START',
        series_id: series_state.series_id,
        chapter_number: series_state.chapter_number,
        target_language,
        is_retranslation,
        is_cache_only,
        is_preload,
        page_ids: pages.map(page => page.page_id),
        first_visible_position: FindFirstVisiblePosition(scanner, pages)
      });

      if (!is_cache_only) SafePost({ action: 'warm-up' });
    },
    [CancelInFlightPage, SafePost]
  );

  const Pause = useCallback(() => {
    CancelInFlightPage();
    Dispatch({ type: 'PAUSE' });
  }, [CancelInFlightPage]);

  const Stop = useCallback(() => {
    CancelInFlightPage();
    Dispatch({ type: 'STOP' });
  }, [CancelInFlightPage]);

  const Resume = useCallback(() => Dispatch({ type: 'RESUME' }), []);

  const RetryPage = useCallback(async (page_index: number): Promise<void> => {
    const job = queue_state_ref.current.jobs.find(
      candidate => candidate.page_index === page_index
    );

    if (job?.status !== 'failed') return;

    if (job.error_code !== 'IMAGE_FETCH_FAILED') {
      Dispatch({ type: 'RETRY_PAGE', page_index, use_capture: false });

      return;
    }

    const element = input_ref.current.scanner.GetElement(job.page_id);

    if (!element) return;

    element.scrollIntoView({ block: 'center' });
    await WaitAnimationFrames(2);

    // An image taller than the window cannot be captured; it stays failed.
    if (
      IsFullyInViewport(element.getBoundingClientRect(), {
        width_px: innerWidth,
        height_px: innerHeight
      })
    ) {
      Dispatch({ type: 'RETRY_PAGE', page_index, use_capture: true });
    }
  }, []);

  const Reset = useCallback(() => {
    port_client_ref.current?.Disconnect();
    ForgetOutstandingSends();
    Dispatch({ type: 'RESET' });
    set_page_results(new Map());
    RestoreHost();
  }, [ForgetOutstandingSends, RestoreHost]);

  return {
    queue_state,
    page_results,
    cached_page_count,
    has_cached_translations,
    Start,
    Pause,
    Resume,
    Stop,
    RetryPage,
    Reset
  };
}
