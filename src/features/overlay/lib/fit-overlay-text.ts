import {
  MAX_OVERLAY_FONT_PX,
  MAX_VERTICAL_GROWTH_RATIO,
  MIN_OVERLAY_FONT_PX
} from '../constants/overlay';
import type { DocumentRect, FittedText } from '../types/overlay';

/**
 * Applies a grown height around the box's vertical center, so an overflowing
 * translation stays centered on the original text instead of sliding down.
 */
export function CenterGrownBox(
  rect: DocumentRect,
  fitted_height_px: number
): DocumentRect {
  const growth_px = fitted_height_px - rect.height_px;

  if (growth_px <= 0) return rect;

  return {
    ...rect,
    top_px: rect.top_px - growth_px / 2,
    height_px: fitted_height_px
  };
}

export function FitOverlayText(input: {
  box_width_px: number;
  box_height_px: number;
  MeasureTextHeight: (font_size_px: number) => number;
  max_font_size_px?: number; // upper bound of the search; MAX_OVERLAY_FONT_PX when omitted
}): FittedText {
  let low_px = MIN_OVERLAY_FONT_PX;
  let high_px = Math.max(
    MIN_OVERLAY_FONT_PX,
    input.max_font_size_px ?? MAX_OVERLAY_FONT_PX
  );
  let fitting_size_px: number | null = null;

  while (low_px <= high_px) {
    const middle_px = Math.floor((low_px + high_px) / 2);

    if (input.MeasureTextHeight(middle_px) <= input.box_height_px) {
      fitting_size_px = middle_px;
      low_px = middle_px + 1;
    } else {
      high_px = middle_px - 1;
    }
  }

  if (fitting_size_px !== null) {
    return {
      font_size_px: fitting_size_px,
      box_height_px: input.box_height_px,
      is_overflowing: false
    };
  }

  const minimum_height_px = input.MeasureTextHeight(MIN_OVERLAY_FONT_PX);
  const max_height_px = input.box_height_px * (1 + MAX_VERTICAL_GROWTH_RATIO);

  return {
    font_size_px: MIN_OVERLAY_FONT_PX,
    box_height_px: Math.max(
      input.box_height_px,
      Math.min(minimum_height_px, max_height_px)
    ),
    is_overflowing: minimum_height_px > max_height_px
  };
}
