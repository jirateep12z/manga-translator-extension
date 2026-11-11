import type { QueueStatus, SeriesState } from '@/features/chapter-translation';

export type AutoStartMode = 'translate' | 'cache-only';

export type AutoStartInput = {
  is_extension_enabled: boolean;
  is_provider_configured: boolean;
  series_state: SeriesState | null;
  // The page URL that series_state was resolved for.
  series_page_url: string | null;
  current_page_url: string;
  // null while the cache status of the current chapter is unknown.
  cached_page_count: number | null;
  page_count: number;
  queue_status: QueueStatus;
  is_tab_visible: boolean;
  has_auto_started: boolean;
  // The checkbox turned the setting on in this chapter. Checking only saves
  // the setting, so this chapter is not translated (spec 0005 §1.7).
  has_enabled_auto_translate_here: boolean;
  // null until the background answers. A preload tab translates only on the
  // background's command (spec 0006 §6.1), even when Chrome reports the
  // minimized window as visible.
  is_preload_tab: boolean | null;
};

// Decides whether a chapter starts without a click (spec 0005 §7.1).
export function ResolveAutoStartMode(
  input: AutoStartInput
): AutoStartMode | null {
  const { series_state } = input;

  // A series state from the previous chapter must not start this one, or
  // its pages would be saved under the previous chapter's number.
  if (
    !input.is_extension_enabled ||
    series_state?.status !== 'bound' ||
    input.series_page_url !== input.current_page_url ||
    input.page_count === 0 ||
    input.queue_status !== 'idle' ||
    !input.is_tab_visible ||
    input.has_auto_started ||
    input.is_preload_tab !== false
  ) {
    return null;
  }

  if (
    series_state.is_auto_translate_enabled &&
    input.is_provider_configured &&
    !input.has_enabled_auto_translate_here
  ) {
    return 'translate';
  }

  if (input.cached_page_count === null) return null;

  return input.cached_page_count > 0 ? 'cache-only' : null;
}
