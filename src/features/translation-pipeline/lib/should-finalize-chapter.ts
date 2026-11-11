import type { ChapterRecord } from '@/services/database';

export function ShouldFinalizeChapter(
  chapter: ChapterRecord | undefined,
  is_forced: boolean
): boolean {
  if (!chapter || chapter.page_notes.length === 0) return false;
  if (is_forced || chapter.summarized_at === null) return true;

  return (
    chapter.notes_updated_at !== null &&
    chapter.notes_updated_at > chapter.summarized_at
  );
}
