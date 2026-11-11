import type { QueueStatus } from '@/features/chapter-translation';
import type { PreloadStartRefusal } from '../types/chapter-preload';

export type PreloadStartInput = {
  is_extension_enabled: boolean;
  is_provider_configured: boolean;
  is_series_bound: boolean;
  is_auto_translate_enabled: boolean;
  series_page_url: string | null;
  page_url: string;
  page_count: number;
  queue_status: QueueStatus;
};

const PRELOAD_START_REFUSALS: ReadonlySet<unknown> =
  new Set<PreloadStartRefusal>([
    'extension-disabled',
    'provider-not-configured',
    'series-not-bound',
    'auto-translate-off',
    'stale-series-state',
    'no-pages',
    'queue-not-idle'
  ]);

export function IsPreloadStartRefusal(
  value: unknown
): value is PreloadStartRefusal {
  return PRELOAD_START_REFUSALS.has(value);
}

// Returns the first spec 0006 §4.2 condition that blocks a preload run, or
// null when the run may start.
export function ResolvePreloadStartRefusal(
  input: PreloadStartInput
): PreloadStartRefusal | null {
  if (!input.is_extension_enabled) return 'extension-disabled';
  if (!input.is_provider_configured) return 'provider-not-configured';
  if (!input.is_series_bound) return 'series-not-bound';
  if (!input.is_auto_translate_enabled) return 'auto-translate-off';
  if (input.series_page_url !== input.page_url) return 'stale-series-state';
  if (input.page_count === 0) return 'no-pages';
  if (input.queue_status !== 'idle') return 'queue-not-idle';

  return null;
}
