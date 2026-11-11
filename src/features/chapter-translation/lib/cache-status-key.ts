import type { TargetLanguage } from '@/types/target-language';

export type CacheStatus = { key: string; cached_page_count: number };

// Identifies the chapter that a cache status was read for (spec 0005 §7.2).
export function CreateCacheStatusKey(input: {
  series_id: string;
  chapter_number: string;
  target_language: TargetLanguage;
  page_hostname: string;
  refresh_count: number;
}): string {
  return JSON.stringify([
    input.series_id,
    input.chapter_number,
    input.target_language,
    input.page_hostname,
    input.refresh_count
  ]);
}

// A status read for another chapter is unknown for the current one, so the
// previous chapter's count never starts a run on the next chapter.
export function ReadCachedPageCount(
  cache_status: CacheStatus | null,
  current_key: string | null
): number | null {
  if (cache_status === null || current_key === null) return null;

  return cache_status.key === current_key
    ? cache_status.cached_page_count
    : null;
}
