import type { QueueState } from '@/features/chapter-translation';

function IsRunningFullRun(
  run: Pick<QueueState, 'status' | 'is_cache_only'>
): boolean {
  return (
    (run.status === 'translating' || run.status === 'paused') &&
    !run.is_cache_only
  );
}

// A full run that starts in a normal tab stops the series' preload session,
// so the two never translate one chapter at once (spec 0006 §4.4). Returns
// the series to cancel, or null.
export function ShouldCancelChapterPreload(
  previous: Pick<QueueState, 'status' | 'is_cache_only'>,
  current: Pick<
    QueueState,
    'status' | 'is_cache_only' | 'is_preload' | 'series_id'
  >
): string | null {
  if (
    current.status !== 'translating' ||
    current.is_cache_only ||
    current.is_preload ||
    current.series_id === null ||
    IsRunningFullRun(previous)
  ) {
    return null;
  }

  return current.series_id;
}
