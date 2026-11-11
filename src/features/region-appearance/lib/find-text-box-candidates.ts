import type { RegionBackdrop, RegionFrame } from '@/services/database';
import type { RgbColor } from '@/types/rgb-color';
import {
  CENTROID_STEP,
  MAX_TEXT_BOX_CANDIDATES,
  OPEN_LIMIT_HEIGHT_GLYPHS,
  OPEN_LIMIT_HEIGHT_RATIO,
  OPEN_LIMIT_VERTICAL_HEIGHT_RATIO,
  OPEN_LIMIT_WIDTH_GLYPHS,
  OPEN_LIMIT_WIDTH_RATIO,
  PAPER_MAX_DISTANCE,
  TEXT_BOX_ASPECT_RATIOS,
  TEXT_MARGIN_MIN_PX,
  TEXT_MARGIN_RATIO,
  VERTICAL_NARROW_RATIO,
  VERTICAL_WIDEN_RATIO
} from '../constants/region-appearance';
import type {
  GlyphEstimate,
  PixelBox,
  RgbaImage
} from '../types/region-appearance';
import type { PaperFill } from './flood-paper';
import { LabelOutsidePixels } from './label-bubble-inside';
import {
  ClipPixelBox,
  ExpandPixelBox,
  IntersectPixelBoxes,
  IsEmptyPixelBox,
  IsPixelBoxOverlapping,
  IsPixelInBox,
  ReadPixelBoxArea
} from './pixel-box';
import { MeasureDistanceAt } from './pixel-sampling';

const MIN_HALF_HEIGHT_PX = 2;

type SearchCenter = { x_px: number; y_px: number };

// Counts the pixels that are not free in any rectangle of the window.
type NotFreeTable = {
  window: PixelBox;
  counts: Int32Array;
  row_length: number;
};

function ReadBoxCenter(box: PixelBox): SearchCenter {
  return {
    x_px: (box.left_px + box.right_px) / 2,
    y_px: (box.top_px + box.bottom_px) / 2
  };
}

function IsSameBox(first: PixelBox, second: PixelBox): boolean {
  return (
    first.left_px === second.left_px &&
    first.top_px === second.top_px &&
    first.right_px === second.right_px &&
    first.bottom_px === second.bottom_px
  );
}

// The padded box, and for narrow vertical text a box widened around the
// region's center (spec 0003 §6.7, fallback candidates).
function ListFallbackCandidates(input: {
  image: RgbaImage;
  box: PixelBox;
  padded_box: PixelBox;
  glyph: GlyphEstimate;
  other_boxes: readonly PixelBox[];
}): PixelBox[] {
  const { image, box, padded_box, glyph, other_boxes } = input;
  const padded_width_px = padded_box.right_px - padded_box.left_px;
  const padded_height_px = padded_box.bottom_px - padded_box.top_px;

  if (
    !glyph.is_vertical ||
    padded_width_px >= VERTICAL_NARROW_RATIO * padded_height_px
  ) {
    return [padded_box];
  }

  const widened_width_px = Math.max(
    padded_width_px,
    VERTICAL_WIDEN_RATIO * padded_height_px
  );
  const center = ReadBoxCenter(box);
  const widened_box = ClipPixelBox(
    {
      left_px: Math.round(center.x_px - widened_width_px / 2),
      top_px: padded_box.top_px,
      right_px: Math.round(center.x_px + widened_width_px / 2),
      bottom_px: padded_box.bottom_px
    },
    image
  );
  const is_overlapping = other_boxes.some(other_box =>
    IsPixelBoxOverlapping(widened_box, other_box)
  );

  return is_overlapping ? [padded_box] : [padded_box, widened_box];
}

// The window for a closed frame. For an open frame, the window intersected
// with a box centered on the region's box (spec 0003 §6.7, step 3).
function ComputeSearchLimit(input: {
  image: RgbaImage;
  box: PixelBox;
  window: PixelBox;
  frame: RegionFrame;
  glyph: GlyphEstimate;
}): PixelBox {
  const { image, box, window, frame, glyph } = input;

  if (frame === 'closed') return window;

  const box_width_px = box.right_px - box.left_px;
  const box_height_px = box.bottom_px - box.top_px;
  const glyph_size_px = glyph.glyph_size_px;
  const limit_width_px = Math.max(
    OPEN_LIMIT_WIDTH_RATIO * box_width_px,
    box_width_px + OPEN_LIMIT_WIDTH_GLYPHS * glyph_size_px,
    glyph.is_vertical ? OPEN_LIMIT_VERTICAL_HEIGHT_RATIO * box_height_px : 0
  );
  const limit_height_px = Math.max(
    OPEN_LIMIT_HEIGHT_RATIO * box_height_px,
    box_height_px + OPEN_LIMIT_HEIGHT_GLYPHS * glyph_size_px
  );
  const center = ReadBoxCenter(box);
  const centered_box = ClipPixelBox(
    {
      left_px: Math.round(center.x_px - limit_width_px / 2),
      top_px: Math.round(center.y_px - limit_height_px / 2),
      right_px: Math.round(center.x_px + limit_width_px / 2),
      bottom_px: Math.round(center.y_px + limit_height_px / 2)
    },
    image
  );

  return IntersectPixelBoxes(window, centered_box);
}

// A summed-area table of the window pixels that are not free
// (spec 0003 §6.7, steps 2 and 4).
function BuildNotFreeTable(input: {
  image: RgbaImage;
  window: PixelBox;
  padded_box: PixelBox;
  fill: PaperFill;
  frame: RegionFrame;
  background_color: RgbColor;
  blocked_boxes: readonly PixelBox[];
}): NotFreeTable {
  const { image, window, padded_box, fill, frame, background_color } = input;
  const window_width_px = window.right_px - window.left_px;
  const window_height_px = window.bottom_px - window.top_px;
  const is_blocked = new Uint8Array(window_width_px * window_height_px);

  for (const blocked_box of input.blocked_boxes) {
    const blocked_part = IntersectPixelBoxes(blocked_box, window);

    for (
      let y_px = blocked_part.top_px;
      y_px < blocked_part.bottom_px;
      y_px++
    ) {
      const row_start = (y_px - window.top_px) * window_width_px;

      is_blocked.fill(
        1,
        row_start + blocked_part.left_px - window.left_px,
        row_start + blocked_part.right_px - window.left_px
      );
    }
  }

  const outside = frame === 'closed' ? LabelOutsidePixels(fill) : null;
  const row_length = window_width_px + 1;
  const counts = new Int32Array(row_length * (window_height_px + 1));

  for (let row = 0; row < window_height_px; row++) {
    const y_px = window.top_px + row;
    let row_not_free_count = 0;

    for (let column = 0; column < window_width_px; column++) {
      const x_px = window.left_px + column;
      const window_index = row * window_width_px + column;
      const is_free =
        is_blocked[window_index] === 0 &&
        (IsPixelInBox(padded_box, x_px, y_px) ||
          (outside
            ? outside[window_index] === 0
            : MeasureDistanceAt(
                image,
                y_px * image.width_px + x_px,
                background_color
              ) < PAPER_MAX_DISTANCE));

      if (!is_free) row_not_free_count++;

      counts[(row + 1) * row_length + column + 1] =
        counts[row * row_length + column + 1] + row_not_free_count;
    }
  }

  return { window, counts, row_length };
}

function CountNotFree(table: NotFreeTable, box: PixelBox): number {
  const { window, counts, row_length } = table;
  const part = IntersectPixelBoxes(box, window);

  if (IsEmptyPixelBox(part)) return 0;

  const left = part.left_px - window.left_px;
  const right = part.right_px - window.left_px;
  const top = part.top_px - window.top_px;
  const bottom = part.bottom_px - window.top_px;

  return (
    counts[bottom * row_length + right] -
    counts[top * row_length + right] -
    counts[bottom * row_length + left] +
    counts[top * row_length + left]
  );
}

// The region's center, and for a closed frame the mean position of the
// filled pixels among every third window pixel (spec 0003 §6.7, step 5).
function ListSearchCenters(
  box: PixelBox,
  fill: PaperFill,
  frame: RegionFrame
): SearchCenter[] {
  const centers = [ReadBoxCenter(box)];

  if (frame !== 'closed') return centers;

  const { window, filled } = fill;
  const window_width_px = window.right_px - window.left_px;
  let sum_x_px = 0;
  let sum_y_px = 0;
  let filled_count = 0;

  for (
    let window_index = 0;
    window_index < filled.length;
    window_index += CENTROID_STEP
  ) {
    if (filled[window_index] !== 1) continue;

    const column = window_index % window_width_px;

    sum_x_px += window.left_px + column;
    sum_y_px += window.top_px + (window_index - column) / window_width_px;
    filled_count++;
  }

  if (filled_count > 0) {
    centers.push({
      x_px: sum_x_px / filled_count,
      y_px: sum_y_px / filled_count
    });
  }

  return centers;
}

function CreateSearchRectangle(
  center: SearchCenter,
  aspect_ratio: number,
  half_height_px: number
): PixelBox {
  const half_width_px = Math.round(half_height_px * aspect_ratio);

  return {
    left_px: Math.round(center.x_px - half_width_px),
    top_px: Math.round(center.y_px - half_height_px),
    right_px: Math.round(center.x_px + half_width_px),
    bottom_px: Math.round(center.y_px + half_height_px)
  };
}

// The largest rectangle of one shape around one center that lies inside the
// shrunk limit and whose margin holds only free pixels, or null
// (spec 0003 §6.7, step 6).
function FindLargestRectangle(input: {
  center: SearchCenter;
  aspect_ratio: number;
  limit: PixelBox;
  margin_px: number;
  table: NotFreeTable;
}): PixelBox | null {
  const { center, aspect_ratio, limit, margin_px, table } = input;
  const shrunk_limit = {
    left_px: limit.left_px + margin_px,
    top_px: limit.top_px + margin_px,
    right_px: limit.right_px - margin_px,
    bottom_px: limit.bottom_px - margin_px
  };
  let low_px = MIN_HALF_HEIGHT_PX;
  let high_px = Math.max(
    limit.right_px - limit.left_px,
    limit.bottom_px - limit.top_px
  );
  let largest_rectangle: PixelBox | null = null;

  while (low_px <= high_px) {
    const middle_px = Math.floor((low_px + high_px) / 2);
    const rectangle = CreateSearchRectangle(center, aspect_ratio, middle_px);
    const is_inside_limit =
      rectangle.left_px >= shrunk_limit.left_px &&
      rectangle.top_px >= shrunk_limit.top_px &&
      rectangle.right_px <= shrunk_limit.right_px &&
      rectangle.bottom_px <= shrunk_limit.bottom_px;
    const is_free =
      is_inside_limit &&
      CountNotFree(table, {
        left_px: rectangle.left_px - margin_px,
        top_px: rectangle.top_px - margin_px,
        right_px: rectangle.right_px + margin_px,
        bottom_px: rectangle.bottom_px + margin_px
      }) === 0;

    if (is_free) {
      largest_rectangle = rectangle;
      low_px = middle_px + 1;
    } else {
      high_px = middle_px - 1;
    }
  }

  return largest_rectangle;
}

// 1 to 8 boxes for the translation, the padded box first (spec 0003 §6.7).
export function FindTextBoxCandidates(input: {
  image: RgbaImage;
  box: PixelBox;
  padded_box: PixelBox;
  window: PixelBox | null;
  fill: PaperFill | null;
  frame: RegionFrame;
  backdrop: RegionBackdrop;
  background_color: RgbColor;
  glyph: GlyphEstimate;
  inner_pad_px: number;
  other_boxes: readonly PixelBox[];
}): PixelBox[] {
  const { image, box, padded_box, window, fill, frame, glyph } = input;
  const fallback_candidates = ListFallbackCandidates(input);

  if (input.backdrop === 'textured' || !window || !fill) {
    return fallback_candidates;
  }

  const table = BuildNotFreeTable({
    image,
    window,
    padded_box,
    fill,
    frame,
    background_color: input.background_color,
    blocked_boxes: input.other_boxes.map(other_box =>
      ExpandPixelBox(other_box, input.inner_pad_px, image)
    )
  });
  const limit = ComputeSearchLimit({ image, box, window, frame, glyph });
  const margin_px = Math.max(
    TEXT_MARGIN_MIN_PX,
    Math.round(TEXT_MARGIN_RATIO * glyph.glyph_size_px)
  );
  const centers = ListSearchCenters(box, fill, frame);
  const kept_rectangles: PixelBox[] = [];

  for (const aspect_ratio of TEXT_BOX_ASPECT_RATIOS) {
    let kept_rectangle: PixelBox | null = null;

    for (const center of centers) {
      const rectangle = FindLargestRectangle({
        center,
        aspect_ratio,
        limit,
        margin_px,
        table
      });

      if (
        rectangle &&
        (!kept_rectangle ||
          ReadPixelBoxArea(rectangle) > ReadPixelBoxArea(kept_rectangle))
      ) {
        kept_rectangle = rectangle;
      }
    }

    if (kept_rectangle) kept_rectangles.push(kept_rectangle);
  }

  if (kept_rectangles.length === 0) return fallback_candidates;

  const candidates = [padded_box];

  for (const rectangle of kept_rectangles) {
    if (candidates.length >= MAX_TEXT_BOX_CANDIDATES) break;
    if (candidates.some(candidate => IsSameBox(candidate, rectangle))) continue;

    candidates.push(rectangle);
  }

  return candidates;
}
