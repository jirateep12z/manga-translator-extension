import {
  PRELOAD_MAX_SCROLL_STOPS,
  PRELOAD_SCROLL_STEP_RATIO,
  SCROLLABLE_OVERFLOW_VALUES
} from '../constants/page-scanner';

export type ScrollMetrics = {
  scroll_height_px: number;
  client_height_px: number;
};

export type ScrollContainerStyle = ScrollMetrics & { overflow_y: string };

// The scroll tops to visit, from the top of the range to its bottom. The
// range is measured once, so content appended while scrolling (for example
// an infinite reader loading the next chapter) is not followed.
export function PlanPreloadScrollStops(metrics: ScrollMetrics): number[] {
  const { scroll_height_px, client_height_px } = metrics;

  if (!Number.isFinite(scroll_height_px) || !Number.isFinite(client_height_px))
    return [];

  if (client_height_px <= 0 || scroll_height_px <= client_height_px) return [];

  const max_scroll_top_px = scroll_height_px - client_height_px;
  const step_px = Math.max(
    1,
    Math.floor(client_height_px * PRELOAD_SCROLL_STEP_RATIO)
  );
  const stops: number[] = [];

  for (
    let scroll_top_px = 0;
    scroll_top_px < max_scroll_top_px &&
    stops.length < PRELOAD_MAX_SCROLL_STOPS;
    scroll_top_px += step_px
  ) {
    stops.push(scroll_top_px);
  }

  if (stops.length < PRELOAD_MAX_SCROLL_STOPS) stops.push(max_scroll_top_px);

  return stops;
}

export function IsScrollContainer(style: ScrollContainerStyle): boolean {
  return (
    SCROLLABLE_OVERFLOW_VALUES.has(style.overflow_y) &&
    style.scroll_height_px > style.client_height_px
  );
}
