import type { PageStatus } from '@/features/chapter-translation';
import type { ChapterArrival } from '../types/chapter-preload';
import { IsFiniteChapterNumber } from './chapter-number';

type ExpectedChapter =
  | { is_source: true; chapter_number: string }
  | { is_source: false; previous_chapter_number: string };

function ReadHostname(page_url: string): string | null {
  try {
    return new URL(page_url).hostname;
  } catch {
    return null;
  }
}

// Decides whether the preload tab shows the chapter the session expects
// (spec 0006 §5.3). Rules are applied in order.
export function IsExpectedChapterArrival(input: {
  status: PageStatus | null;
  series_id: string;
  source_hostname: string;
  expected: ExpectedChapter;
  departed_page_url: string | null;
}): ChapterArrival {
  const { status, expected } = input;

  if (status === null || status.page_url === '') return 'pending';

  // A router may change the URL only after it loads the next chapter.
  if (status.page_url === input.departed_page_url) return 'pending';

  if (status.series === null || status.series_page_url !== status.page_url) {
    return 'pending';
  }

  if (
    ReadHostname(status.page_url) !== input.source_hostname ||
    status.series.series_id !== input.series_id
  ) {
    return 'wrong-chapter';
  }

  if (expected.is_source) {
    return status.chapter_number === expected.chapter_number
      ? 'arrived'
      : 'wrong-chapter';
  }

  return IsFiniteChapterNumber(status.chapter_number) &&
    Number(status.chapter_number) > Number(expected.previous_chapter_number)
    ? 'arrived'
    : 'wrong-chapter';
}
