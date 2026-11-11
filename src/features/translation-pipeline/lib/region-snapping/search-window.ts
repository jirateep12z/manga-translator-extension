import { ExpandRect, IntersectRects, type Rect } from './geometry';
import type { GrayImage } from './types';

// The near window is tried first; the wide one only when the near one finds
// no text, because a wide window can close large panel backgrounds.
export const SEARCH_EXPAND_RATIOS = [1, 2.5] as const;
export const WIDEST_SEARCH_EXPAND_RATIO =
  SEARCH_EXPAND_RATIOS[SEARCH_EXPAND_RATIOS.length - 1];
const MIN_SEARCH_EXPAND_RATIO_OF_PAGE = 0.03;

// Pixels at or above this gray are bubble paper.
export const WHITE_MIN_GRAY = 200;

export function IsNearPass(expand_ratio: number): boolean {
  return expand_ratio === SEARCH_EXPAND_RATIOS[0];
}

export function ComputeSearchWindow(
  image: GrayImage,
  model_rect: Rect,
  expand_ratio: number,
  min_margin_px: number = MIN_SEARCH_EXPAND_RATIO_OF_PAGE * image.height_px
): Rect {
  const margin_px = Math.max(
    expand_ratio *
      Math.max(
        model_rect.right_px - model_rect.left_px,
        model_rect.bottom_px - model_rect.top_px
      ),
    min_margin_px
  );

  return IntersectRects(ExpandRect(model_rect, Math.round(margin_px)), {
    left_px: 0,
    top_px: 0,
    right_px: image.width_px,
    bottom_px: image.height_px
  });
}
