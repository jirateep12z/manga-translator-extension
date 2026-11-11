import {
  LABEL_FONT_MAX_PX,
  LABEL_FONT_MIN_PX,
  LABEL_FONT_RATIO,
  LABEL_GAP_PX,
  LABEL_MIN_WIDTH_EM
} from '../constants/overlay';
import type { DocumentRect, PixelSize } from '../types/overlay';

// The font size of a label for display lettering or an open-frame sound
// effect, not rounded (spec 0003 §8.7, as amended by §20).
export function ComputeLabelFontSize(glyph_css_px: number): number {
  return Math.min(
    LABEL_FONT_MAX_PX,
    Math.max(LABEL_FONT_MIN_PX, glyph_css_px * LABEL_FONT_RATIO)
  );
}

// Below the region when the label stays on the page, else above it when the
// label stays on the page, else inside the region at its bottom.
function ChooseLabelTopPx(
  region_rect: DocumentRect,
  label_height_px: number,
  content_height_px: number
): number {
  const region_bottom_px = region_rect.top_px + region_rect.height_px;
  const below_top_px = region_bottom_px + LABEL_GAP_PX;

  if (below_top_px + label_height_px <= content_height_px) return below_top_px;

  const above_top_px = region_rect.top_px - LABEL_GAP_PX - label_height_px;

  if (above_top_px >= 0) return above_top_px;

  return region_bottom_px - label_height_px;
}

// Places a label for display lettering or an open-frame sound effect, so the
// lettering stays in view (spec 0003 §8.7, as amended by §20). The label is at
// least LABEL_MIN_WIDTH_EM wide, centered on the region, and inside the
// content rect horizontally. Rects are in CSS pixels, relative to the page's
// content rect.
export function PlaceLabel(input: {
  region_rect: DocumentRect;
  content_size: PixelSize;
  font_size_px: number;
  MeasureTextHeight: (width_px: number, font_size_px: number) => number;
}): DocumentRect {
  const { region_rect, content_size, font_size_px } = input;
  const width_px = Math.min(
    content_size.width_px,
    Math.max(region_rect.width_px, LABEL_MIN_WIDTH_EM * font_size_px)
  );
  const centered_left_px =
    region_rect.left_px + (region_rect.width_px - width_px) / 2;
  const left_px = Math.min(
    content_size.width_px - width_px,
    Math.max(0, centered_left_px)
  );
  const height_px = input.MeasureTextHeight(width_px, font_size_px);

  return {
    left_px,
    top_px: ChooseLabelTopPx(region_rect, height_px, content_size.height_px),
    width_px,
    height_px
  };
}
