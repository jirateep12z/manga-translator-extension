import {
  RESCAN_DEBOUNCE_MS,
  RESCAN_MAX_WAIT_MS
} from '../constants/page-scanner';

export function ResolveRescanDelayMs(
  pending_since_ms: number,
  now_ms: number
): number {
  const remaining_wait_ms = pending_since_ms + RESCAN_MAX_WAIT_MS - now_ms;

  return Math.max(0, Math.min(RESCAN_DEBOUNCE_MS, remaining_wait_ms));
}
