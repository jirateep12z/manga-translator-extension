import type { PageStatus } from '@/features/chapter-translation';
import {
  NAVIGATION_TIMEOUT_MS,
  PAGE_STABLE_MS,
  PAGE_WAIT_TIMEOUT_MS,
  RUN_TIMEOUT_MS
} from '../constants/chapter-preload';
import type {
  ChapterPreloadSession,
  PreloadStepDecision
} from '../types/chapter-preload';
import { IsExpectedChapterArrival } from './is-expected-chapter-arrival';

function Wait(session: ChapterPreloadSession): PreloadStepDecision {
  return { kind: 'wait', session };
}

function Stop(
  session: ChapterPreloadSession,
  reason: Extract<PreloadStepDecision, { kind: 'stop' }>['reason']
): PreloadStepDecision {
  return { kind: 'stop', reason, session };
}

function IsElapsed(
  session: ChapterPreloadSession,
  now_ms: number,
  limit_ms: number
): boolean {
  return now_ms - session.step_started_at_ms >= limit_ms;
}

function ResolveAtSource(
  session: ChapterPreloadSession,
  status: PageStatus | null,
  now_ms: number
): PreloadStepDecision {
  const arrival = IsExpectedChapterArrival({
    status,
    series_id: session.series_id,
    source_hostname: session.source_hostname,
    expected: {
      is_source: true,
      chapter_number: session.source_chapter_number
    },
    departed_page_url: null
  });

  if (arrival === 'arrived' && status !== null) {
    return {
      kind: 'send-go-next',
      session: {
        ...session,
        step: 'moving',
        departed_page_url: status.page_url,
        step_started_at_ms: now_ms
      }
    };
  }

  if (arrival === 'wrong-chapter') return Stop(session, 'wrong-chapter');

  return IsElapsed(session, now_ms, NAVIGATION_TIMEOUT_MS)
    ? Stop(session, 'timeout')
    : Wait(session);
}

function ResolveMoving(
  session: ChapterPreloadSession,
  status: PageStatus | null,
  now_ms: number
): PreloadStepDecision {
  const arrival = IsExpectedChapterArrival({
    status,
    series_id: session.series_id,
    source_hostname: session.source_hostname,
    expected: {
      is_source: false,
      previous_chapter_number: session.previous_chapter_number
    },
    departed_page_url: session.departed_page_url
  });

  if (arrival === 'arrived' && status !== null) {
    return Wait({
      ...session,
      step: 'waiting-pages',
      step_started_at_ms: now_ms,
      current_chapter_number: status.chapter_number,
      stable_page_count: status.page_count,
      stable_since_ms: now_ms
    });
  }

  if (arrival === 'wrong-chapter') return Stop(session, 'wrong-chapter');

  return IsElapsed(session, now_ms, NAVIGATION_TIMEOUT_MS)
    ? Stop(session, 'timeout')
    : Wait(session);
}

function ResolveWaitingPages(
  session: ChapterPreloadSession,
  status: PageStatus | null,
  now_ms: number
): PreloadStepDecision {
  const is_count_changed =
    status !== null && status.page_count !== session.stable_page_count;

  if (
    status !== null &&
    !is_count_changed &&
    status.page_count > 0 &&
    now_ms - session.stable_since_ms >= PAGE_STABLE_MS
  ) {
    return {
      kind: 'send-start',
      session: {
        ...session,
        step: 'translating',
        has_seen_run: false,
        step_started_at_ms: now_ms
      }
    };
  }

  if (IsElapsed(session, now_ms, PAGE_WAIT_TIMEOUT_MS)) {
    return Stop(session, 'no-pages');
  }

  return is_count_changed
    ? Wait({
        ...session,
        stable_page_count: status.page_count,
        stable_since_ms: now_ms
      })
    : Wait(session);
}

function FinishChapter(
  session: ChapterPreloadSession,
  status: PageStatus,
  now_ms: number
): PreloadStepDecision {
  const chapter_number =
    session.current_chapter_number ?? status.chapter_number ?? '';
  const prepared_chapter_numbers = [
    ...session.prepared_chapter_numbers,
    chapter_number
  ];
  const is_last =
    prepared_chapter_numbers.length >= session.target_chapter_count;
  const finished_session: ChapterPreloadSession = {
    ...session,
    prepared_chapter_numbers,
    previous_chapter_number: chapter_number
  };

  return {
    kind: 'chapter-finished',
    is_last,
    session: is_last
      ? finished_session
      : {
          ...finished_session,
          step: 'moving',
          current_chapter_number: null,
          departed_page_url: status.page_url,
          step_started_at_ms: now_ms
        }
  };
}

function ResolveTranslating(
  session: ChapterPreloadSession,
  status: PageStatus | null,
  now_ms: number
): PreloadStepDecision {
  if (status !== null) {
    const { queue_status, is_preload_run } = status;

    if (
      is_preload_run &&
      (queue_status === 'translating' || queue_status === 'paused')
    ) {
      if (IsElapsed(session, now_ms, RUN_TIMEOUT_MS)) {
        return Stop(session, 'timeout');
      }

      // The same object means "unchanged", so the caller skips the write.
      return Wait(
        session.has_seen_run ? session : { ...session, has_seen_run: true }
      );
    }

    if (is_preload_run && queue_status === 'completed') {
      return FinishChapter(session, status, now_ms);
    }

    // Start returned early on its own guards (spec 0006 §7.2 rule 5).
    if (queue_status === 'idle' && !session.has_seen_run) {
      return Stop(session, 'start-refused');
    }

    return Stop(session, 'run-ended');
  }

  return IsElapsed(session, now_ms, RUN_TIMEOUT_MS)
    ? Stop(session, 'timeout')
    : Wait(session);
}

// Decides the next step of a preload session from the latest page status
// (spec 0006 §7.2). The caller stores the returned session before acting.
export function ResolvePreloadStep(
  session: ChapterPreloadSession,
  status: PageStatus | null,
  now_ms: number
): PreloadStepDecision {
  switch (session.step) {
    case 'opening':
      return Wait(session);
    case 'at-source':
      return ResolveAtSource(session, status, now_ms);
    case 'moving':
      return ResolveMoving(session, status, now_ms);
    case 'waiting-pages':
      return ResolveWaitingPages(session, status, now_ms);
    case 'translating':
      return ResolveTranslating(session, status, now_ms);
  }
}
