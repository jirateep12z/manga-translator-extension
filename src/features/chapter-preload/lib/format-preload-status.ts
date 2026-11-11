import { FormatChapterLabel } from '@/features/chapter-translation';
import type { ChapterPreloadStatus } from '../types/chapter-preload';

const PREPARING_TEXT = 'Preparing next chapters…';

// The panel line below the auto-translate checkbox (spec 0006 §8).
export function FormatPreloadStatus(
  status: ChapterPreloadStatus
): string | null {
  if (status.state === 'preparing') {
    return status.current_chapter_number === null
      ? PREPARING_TEXT
      : `${PREPARING_TEXT} ${FormatChapterLabel(status.current_chapter_number)}`;
  }

  const prepared = status.prepared_chapter_numbers;

  if (prepared.length === 0) return null;

  if (prepared.length === 1) {
    return `Next chapter prepared: ${FormatChapterLabel(prepared[0])}`;
  }

  return `Next chapters prepared: ${FormatChapterLabel(prepared[0])}–${prepared[prepared.length - 1]}`;
}
