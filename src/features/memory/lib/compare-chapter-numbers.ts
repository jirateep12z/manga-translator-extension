import type { ChapterRecord } from '@/services/database';

const NUMERIC_CHAPTER_PATTERN = /^\d+(?:\.\d+)?$/;

function IsNumericChapter(chapter_number: string): boolean {
  return NUMERIC_CHAPTER_PATTERN.test(chapter_number);
}

export function CompareChapterNumbers(
  left: ChapterRecord,
  right: ChapterRecord
): number {
  const is_left_numeric = IsNumericChapter(left.chapter_number);
  const is_right_numeric = IsNumericChapter(right.chapter_number);

  if (is_left_numeric && is_right_numeric) {
    const difference =
      Number(left.chapter_number) - Number(right.chapter_number);

    if (difference !== 0) return difference;
  } else if (is_left_numeric !== is_right_numeric) {
    return is_left_numeric ? -1 : 1;
  } else if (left.created_at !== right.created_at) {
    return left.created_at < right.created_at ? -1 : 1;
  }

  return left.chapter_number.localeCompare(right.chapter_number);
}
