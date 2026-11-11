import type { PageStatus, QueueStatus } from '@/features/chapter-translation';
import { IsRecord } from '@/lib/is-record';
import type {
  CancelChapterPreloadMessage,
  ChapterPreloadStatus,
  ChapterPreloadStatusMessage,
  GetPreloadTabRoleMessage,
  RequestChapterPreloadMessage
} from '../types/chapter-preload';

const QUEUE_STATUSES: readonly QueueStatus[] = [
  'idle',
  'confirming-series',
  'translating',
  'paused',
  'completed',
  'stopped',
  'error'
];
const PRELOAD_STATES: readonly ChapterPreloadStatus['state'][] = [
  'preparing',
  'finished'
];

function IsStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function IsStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every(entry => typeof entry === 'string')
  );
}

export function IsRequestChapterPreloadMessage(
  message: unknown
): message is RequestChapterPreloadMessage {
  return (
    IsRecord(message) &&
    message.action === 'request-chapter-preload' &&
    typeof message.series_id === 'string' &&
    typeof message.chapter_number === 'string'
  );
}

export function IsCancelChapterPreloadMessage(
  message: unknown
): message is CancelChapterPreloadMessage {
  return (
    IsRecord(message) &&
    message.action === 'cancel-chapter-preload' &&
    typeof message.series_id === 'string'
  );
}

export function IsGetPreloadTabRoleMessage(
  message: unknown
): message is GetPreloadTabRoleMessage {
  return IsRecord(message) && message.action === 'get-preload-tab-role';
}

function IsChapterPreloadStatus(value: unknown): value is ChapterPreloadStatus {
  return (
    IsRecord(value) &&
    typeof value.session_id === 'string' &&
    typeof value.series_id === 'string' &&
    typeof value.source_chapter_number === 'string' &&
    PRELOAD_STATES.includes(value.state as ChapterPreloadStatus['state']) &&
    IsStringOrNull(value.current_chapter_number) &&
    IsStringArray(value.prepared_chapter_numbers)
  );
}

export function IsChapterPreloadStatusMessage(
  message: unknown
): message is ChapterPreloadStatusMessage {
  return (
    IsRecord(message) &&
    message.action === 'chapter-preload-status' &&
    IsChapterPreloadStatus(message.status)
  );
}

function IsPageStatusSeries(value: unknown): boolean {
  return (
    value === null ||
    (IsRecord(value) &&
      typeof value.series_id === 'string' &&
      typeof value.canonical_title === 'string')
  );
}

// Validates the extended page status that the session polls (spec 0006 §6.4).
export function IsPreloadPageStatus(value: unknown): value is PageStatus {
  return (
    IsRecord(value) &&
    typeof value.is_available === 'boolean' &&
    IsPageStatusSeries(value.series) &&
    IsStringOrNull(value.chapter_number) &&
    typeof value.page_count === 'number' &&
    typeof value.has_cached_translations === 'boolean' &&
    typeof value.page_url === 'string' &&
    IsStringOrNull(value.series_page_url) &&
    QUEUE_STATUSES.includes(value.queue_status as QueueStatus) &&
    typeof value.is_preload_run === 'boolean'
  );
}
