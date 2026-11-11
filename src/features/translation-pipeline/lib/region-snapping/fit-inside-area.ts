import { WHITE_LABEL } from './closed-areas';
import {
  ExpandRect,
  IntersectRects,
  ToLocalIndex,
  UniteRects,
  type Rect
} from './geometry';
import { WHITE_MIN_GRAY } from './search-window';
import type { GrayImage, TextArea } from './types';

const PADDING_RATIO_OF_GLYPH = 0.35;

type Point = { x_px: number; y_px: number };
type IsPaperAt = (x_px: number, y_px: number) => boolean;

function ComputePaddingPx(area: TextArea): number {
  return Math.max(1, Math.round(area.glyph_height_px * PADDING_RATIO_OF_GLYPH));
}

export function PadInsideArea(text_rect: Rect, area: TextArea): Rect {
  return IntersectRects(
    ExpandRect(text_rect, ComputePaddingPx(area)),
    area.bounds
  );
}

/**
 * True when every pixel of the image-space segment is paper inside the
 * bounds. Any ink, such as the outline or speed lines drawn inside the
 * bubble, stops it.
 */
function IsSegmentOnPaper(
  bounds: Rect,
  IsPaper: IsPaperAt,
  from: Point,
  to: Point
): boolean {
  for (let y_px = from.y_px; y_px <= to.y_px; y_px++) {
    for (let x_px = from.x_px; x_px <= to.x_px; x_px++) {
      const is_outside_bounds =
        x_px < bounds.left_px ||
        x_px >= bounds.right_px ||
        y_px < bounds.top_px ||
        y_px >= bounds.bottom_px;

      if (is_outside_bounds || !IsPaper(x_px, y_px)) return false;
    }
  }

  return true;
}

/** Grows each side by one pixel per pass while the new edge stays on paper. */
function GrowOnPaper(text_rect: Rect, bounds: Rect, IsPaper: IsPaperAt): Rect {
  let rect = text_rect;
  let has_grown = true;

  while (has_grown) {
    has_grown = false;

    const right_x_px = rect.right_px - 1;
    const bottom_y_px = rect.bottom_px - 1;
    const sides = [
      {
        next: { ...rect, top_px: rect.top_px - 1 },
        from: { x_px: rect.left_px, y_px: rect.top_px - 1 },
        to: { x_px: right_x_px, y_px: rect.top_px - 1 }
      },
      {
        next: { ...rect, bottom_px: rect.bottom_px + 1 },
        from: { x_px: rect.left_px, y_px: rect.bottom_px },
        to: { x_px: right_x_px, y_px: rect.bottom_px }
      },
      {
        next: { ...rect, left_px: rect.left_px - 1 },
        from: { x_px: rect.left_px - 1, y_px: rect.top_px },
        to: { x_px: rect.left_px - 1, y_px: bottom_y_px }
      },
      {
        next: { ...rect, right_px: rect.right_px + 1 },
        from: { x_px: rect.right_px, y_px: rect.top_px },
        to: { x_px: rect.right_px, y_px: bottom_y_px }
      }
    ];

    for (const side of sides) {
      if (!IsSegmentOnPaper(bounds, IsPaper, side.from, side.to)) continue;

      rect = UniteRects(rect, side.next);
      has_grown = true;
    }
  }

  return rect;
}

/** The grown rect less a margin, never smaller than the text. */
function InsetGrownRect(
  grown_rect: Rect,
  text_rect: Rect,
  area: TextArea
): Rect {
  const inset_rect = ExpandRect(grown_rect, -ComputePaddingPx(area));

  return IntersectRects(UniteRects(inset_rect, text_rect), grown_rect);
}

function IsTouchingBounds(rect: Rect, bounds: Rect): boolean {
  return (
    rect.left_px <= bounds.left_px ||
    rect.top_px <= bounds.top_px ||
    rect.right_px >= bounds.right_px ||
    rect.bottom_px >= bounds.bottom_px
  );
}

/**
 * A bubble with one caption gives the translation the largest rectangle of
 * paper around the text, less a margin, so the font can fill the bubble
 * without covering its outline. Lettering without a closed bubble is only
 * padded.
 */
export function FillInsideArea(text_rect: Rect, area: TextArea): Rect {
  const { bounds, pixel_labels } = area;

  if (!pixel_labels) return PadInsideArea(text_rect, area);

  const grown_rect = GrowOnPaper(
    text_rect,
    bounds,
    (x_px, y_px) =>
      pixel_labels[ToLocalIndex(bounds, x_px, y_px)] === WHITE_LABEL
  );

  return InsetGrownRect(grown_rect, text_rect, area);
}

/**
 * Free lettering gets the paper that ink encloses around it within the
 * search window, as the strokes of a bubble drawn only with speed lines do,
 * so its translation can be as large as the lettering. Lettering on paper
 * that reaches the window's edge is only padded. The box is never smaller
 * than the padded text, because the padding covers strokes too thin to count
 * as glyphs, such as a hairline "I" at the text's edge.
 */
export function FillEnclosedPaper(
  image: GrayImage,
  text_rect: Rect,
  area: TextArea
): Rect {
  const padded_rect = PadInsideArea(text_rect, area);
  const grown_rect = GrowOnPaper(
    text_rect,
    area.bounds,
    (x_px, y_px) => image.pixels[y_px * image.width_px + x_px] >= WHITE_MIN_GRAY
  );

  return IsTouchingBounds(grown_rect, area.bounds)
    ? padded_rect
    : UniteRects(InsetGrownRect(grown_rect, text_rect, area), padded_rect);
}
