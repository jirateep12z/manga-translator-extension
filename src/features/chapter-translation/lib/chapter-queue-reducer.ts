import type { TargetLanguage } from '@/types/target-language';
import { MAX_PAGE_RESENDS, STOP_ERROR_CODES } from '../constants/queue';
import type {
  PageJob,
  QueueAction,
  QueueProgress,
  QueueState,
  QueueStatus
} from '../types/queue';
import { OrderPagesForQueue } from './order-pages-for-queue';

const CONFIRMABLE_STATUSES: ReadonlySet<QueueStatus> = new Set([
  'idle',
  'completed',
  'stopped',
  'error'
]);
const RUNNING_STATUSES: ReadonlySet<QueueStatus> = new Set([
  'translating',
  'paused'
]);

export function CreateInitialQueueState(
  target_language: TargetLanguage
): QueueState {
  return {
    status: 'idle',
    series_id: null,
    chapter_number: null,
    target_language,
    is_retranslation: false,
    is_cache_only: false,
    is_preload: false,
    is_warming_up: false,
    jobs: [],
    stop_error_code: null
  };
}

const FINISHED_JOB_STATUSES: ReadonlySet<PageJob['status']> = new Set([
  'done',
  'failed',
  'skipped'
]);

function UpdateJob(
  state: QueueState,
  page_index: number,
  Update: (job: PageJob) => PageJob
): QueueState {
  return {
    ...state,
    jobs: state.jobs.map(job =>
      job.page_index === page_index ? Update(job) : job
    )
  };
}

function ReturnInFlightToPending(jobs: PageJob[]): PageJob[] {
  return jobs.map(job =>
    job.status === 'in_flight' ? { ...job, status: 'pending' } : job
  );
}

function ApplyCompletionCheck(state: QueueState): QueueState {
  const is_finished = state.jobs.every(job =>
    FINISHED_JOB_STATUSES.has(job.status)
  );

  return state.status === 'translating' && is_finished
    ? { ...state, status: 'completed' }
    : state;
}

function ReducePageError(
  state: QueueState,
  action: Extract<QueueAction, { type: 'PAGE_ERROR' }>
): QueueState {
  const is_stop_code = STOP_ERROR_CODES.has(action.error_code);

  if (state.is_warming_up) {
    return is_stop_code
      ? {
          ...state,
          is_warming_up: false,
          status: 'error',
          stop_error_code: action.error_code
        }
      : { ...state, is_warming_up: false };
  }

  const job = state.jobs.find(
    candidate => candidate.page_index === action.page_index
  );

  // A late error for a page that is no longer in flight must not undo a
  // result or fail a page that is waiting to be sent.
  if (job?.status !== 'in_flight') return state;

  // The hook drops replies to its own cancel requests, so this CANCELED came
  // from the background. Stopping avoids an endless resend loop.
  if (action.error_code === 'CANCELED') {
    return RUNNING_STATUSES.has(state.status)
      ? {
          ...state,
          status: 'stopped',
          jobs: ReturnInFlightToPending(state.jobs)
        }
      : state;
  }

  // A cache-only run is a best-effort display: any other error skips the
  // page, so it shows no failure and never reaches the capture retry.
  if (state.is_cache_only) {
    return ApplyCompletionCheck(
      UpdateJob(state, action.page_index, current => ({
        ...current,
        status: 'skipped',
        error_code: action.error_code
      }))
    );
  }

  const failed_state = UpdateJob(state, action.page_index, current => ({
    ...current,
    status: 'failed',
    error_code: action.error_code
  }));

  return is_stop_code
    ? { ...failed_state, status: 'error', stop_error_code: action.error_code }
    : ApplyCompletionCheck(failed_state);
}

function ReducePortDisconnected(state: QueueState): QueueState {
  const in_flight_job = SelectInFlightJob(state);
  const cleared_state = { ...state, is_warming_up: false };

  if (!in_flight_job) return cleared_state;

  if (in_flight_job.resend_count < MAX_PAGE_RESENDS) {
    return UpdateJob(cleared_state, in_flight_job.page_index, job => ({
      ...job,
      status: 'pending',
      resend_count: job.resend_count + 1
    }));
  }

  // A cache-only run skips the page instead, so it shows no failure.
  return ApplyCompletionCheck(
    UpdateJob(cleared_state, in_flight_job.page_index, job => ({
      ...job,
      status: state.is_cache_only ? 'skipped' : 'failed',
      error_code: 'PROVIDER_UNAVAILABLE'
    }))
  );
}

function ReducePagesFound(state: QueueState, page_ids: string[]): QueueState {
  if (!RUNNING_STATUSES.has(state.status)) return state;

  const known_page_ids = new Set(state.jobs.map(job => job.page_id));
  let next_page_index =
    Math.max(-1, ...state.jobs.map(job => job.page_index)) + 1;
  const new_jobs: PageJob[] = [];

  for (const page_id of page_ids) {
    if (known_page_ids.has(page_id)) continue;

    known_page_ids.add(page_id);
    new_jobs.push(CreatePendingJob(page_id, next_page_index));
    next_page_index++;
  }

  return new_jobs.length === 0
    ? state
    : { ...state, jobs: [...state.jobs, ...new_jobs] };
}

function CreatePendingJob(page_id: string, page_index: number): PageJob {
  return {
    page_id,
    page_index,
    status: 'pending',
    outcome: null,
    error_code: null,
    resend_count: 0,
    use_capture: false
  };
}

function ReduceRetryPage(
  state: QueueState,
  action: Extract<QueueAction, { type: 'RETRY_PAGE' }>
): QueueState {
  const job = state.jobs.find(
    candidate => candidate.page_index === action.page_index
  );

  if (!job || job.status !== 'failed') return state;

  const retried_state = UpdateJob(state, action.page_index, current => ({
    ...current,
    status: 'pending',
    error_code: null,
    resend_count: 0,
    use_capture: action.use_capture
  }));

  return RUNNING_STATUSES.has(state.status)
    ? retried_state
    : {
        ...retried_state,
        status: 'translating',
        is_warming_up: false,
        stop_error_code: null
      };
}

// A full run may replace a translating cache-only run (spec 0005 §6.2 rule 2).
function IsCacheOnlyRunReplaceable(
  state: QueueState,
  action: Extract<QueueAction, { type: 'START' }>
): boolean {
  return (
    state.is_cache_only &&
    state.status === 'translating' &&
    !action.is_cache_only
  );
}

export function ChapterQueueReducer(
  state: QueueState,
  action: QueueAction
): QueueState {
  switch (action.type) {
    case 'REQUEST_SERIES_CONFIRMATION':
      return CONFIRMABLE_STATUSES.has(state.status)
        ? { ...state, status: 'confirming-series' }
        : state;
    case 'CANCEL_SERIES_CONFIRMATION':
      return state.status === 'confirming-series'
        ? { ...state, status: 'idle' }
        : state;
    case 'START':
      if (
        (RUNNING_STATUSES.has(state.status) &&
          !IsCacheOnlyRunReplaceable(state, action)) ||
        action.page_ids.length === 0
      ) {
        return state;
      }

      return {
        status: 'translating',
        series_id: action.series_id,
        chapter_number: action.chapter_number,
        target_language: action.target_language,
        is_retranslation: action.is_retranslation,
        is_cache_only: action.is_cache_only,
        is_preload: action.is_preload,
        is_warming_up: !action.is_cache_only,
        stop_error_code: null,
        jobs: OrderPagesForQueue(
          action.page_ids,
          action.first_visible_position
        ).map(page => CreatePendingJob(page.page_id, page.page_index))
      };
    case 'WARM_UP_DONE':
      return state.is_warming_up ? { ...state, is_warming_up: false } : state;
    case 'PAGE_SENT': {
      const job = state.jobs.find(
        candidate => candidate.page_index === action.page_index
      );

      if (state.status !== 'translating' || job?.status !== 'pending') {
        return state;
      }

      return UpdateJob(state, action.page_index, current => ({
        ...current,
        status: 'in_flight'
      }));
    }

    case 'PAGE_RESULT': {
      const job = state.jobs.find(
        candidate => candidate.page_index === action.page_index
      );

      if (!job || job.status === 'done') return state;

      return ApplyCompletionCheck(
        UpdateJob(state, action.page_index, current => ({
          ...current,
          status: 'done',
          outcome: action.outcome,
          error_code: null
        }))
      );
    }

    case 'PAGE_ERROR':
      return ReducePageError(state, action);
    case 'PORT_DISCONNECTED':
      return ReducePortDisconnected(state);
    case 'PAUSE':
      return state.status === 'translating' && !state.is_cache_only
        ? {
            ...state,
            status: 'paused',
            jobs: ReturnInFlightToPending(state.jobs)
          }
        : state;
    case 'RESUME':
      return state.status === 'paused'
        ? { ...state, status: 'translating' }
        : state;
    case 'STOP':
      return RUNNING_STATUSES.has(state.status)
        ? {
            ...state,
            status: 'stopped',
            jobs: ReturnInFlightToPending(state.jobs)
          }
        : state;
    case 'PAGES_FOUND':
      return ReducePagesFound(state, action.page_ids);
    case 'RETRY_PAGE':
      return ReduceRetryPage(state, action);
    case 'RESET':
      return CreateInitialQueueState(state.target_language);
  }
}

export function SelectNextJob(state: QueueState): PageJob | null {
  if (
    state.status !== 'translating' ||
    state.is_warming_up ||
    SelectInFlightJob(state)
  ) {
    return null;
  }

  return state.jobs.find(job => job.status === 'pending') ?? null;
}

export function SelectInFlightJob(state: QueueState): PageJob | null {
  return state.jobs.find(job => job.status === 'in_flight') ?? null;
}

export function SelectQueueProgress(state: QueueState): QueueProgress {
  const done_jobs = state.jobs.filter(job => job.status === 'done');
  const failed_count = state.jobs.filter(job => job.status === 'failed').length;
  const skipped_count = state.jobs.filter(
    job => job.status === 'skipped'
  ).length;

  return {
    total_count: state.jobs.length,
    finished_count: done_jobs.length + failed_count + skipped_count,
    translated_count: done_jobs.length,
    warning_count: done_jobs.filter(
      job => job.outcome === 'translated_with_warnings'
    ).length,
    failed_count,
    skipped_count
  };
}
