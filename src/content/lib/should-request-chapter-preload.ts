import { IsFiniteChapterNumber } from '@/features/chapter-preload';
import type {
  QueueState,
  QueueStatus,
  SeriesState
} from '@/features/chapter-translation';

// A full run that just completed in an auto-translate series requests a
// next-chapter preload (spec 0006 §4.4).
export function ShouldRequestChapterPreload(input: {
  previous_status: QueueStatus;
  queue_state: Pick<
    QueueState,
    'status' | 'is_cache_only' | 'is_preload' | 'series_id' | 'chapter_number'
  >;
  series_state: SeriesState | null;
}): boolean {
  const { queue_state, series_state } = input;

  return (
    queue_state.status === 'completed' &&
    input.previous_status !== 'completed' &&
    !queue_state.is_cache_only &&
    !queue_state.is_preload &&
    series_state?.status === 'bound' &&
    series_state.is_auto_translate_enabled &&
    series_state.series_id === queue_state.series_id &&
    IsFiniteChapterNumber(queue_state.chapter_number)
  );
}
