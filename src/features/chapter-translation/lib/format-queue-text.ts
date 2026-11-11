import {
  CACHE_ONLY_STATUS_LABEL,
  QUEUE_STATUS_LABELS
} from '../constants/panel';
import type { QueueProgress, QueueState } from '../types/queue';

const URL_CHAPTER_PREFIX = 'url:';
const UNKNOWN_CHAPTER_LABEL = 'Ch. ?';

export function FormatMatchPercent(score: number): number {
  return Math.round(score * 100);
}

export function FormatChapterLabel(chapter_number: string | null): string {
  if (
    chapter_number === null ||
    chapter_number.startsWith(URL_CHAPTER_PREFIX)
  ) {
    return UNKNOWN_CHAPTER_LABEL;
  }

  return `Ch. ${chapter_number}`;
}

export function FormatProgressText(
  progress: QueueProgress,
  is_cache_only = false
): {
  counter_text: string;
  summary_text: string;
} {
  const counter_text = `${progress.finished_count} / ${progress.total_count} pages`;

  // A cache-only run skips pages instead of failing them (spec 0005 §6.3).
  if (is_cache_only) {
    return {
      counter_text,
      summary_text: `${progress.translated_count} of ${progress.total_count} pages from saved translations`
    };
  }

  const summary_text = `${progress.translated_count} translated, ${progress.failed_count} failed`;

  return {
    counter_text,
    summary_text:
      progress.warning_count > 0
        ? `${summary_text}, ${progress.warning_count} with warnings`
        : summary_text
  };
}

export function ResolveQueueStatusLabel(
  queue_state: Pick<QueueState, 'status' | 'is_cache_only'>
): string {
  return queue_state.status === 'translating' && queue_state.is_cache_only
    ? CACHE_ONLY_STATUS_LABEL
    : QUEUE_STATUS_LABELS[queue_state.status];
}
