import {
  CreateRectKey,
  ExpandRect,
  IntersectRects,
  MeasureGap,
  NEIGHBOR_OFFSETS_8,
  RectArea,
  UniteRects,
  type Rect
} from './geometry';
import {
  ComputeSearchWindow,
  SEARCH_EXPAND_RATIOS,
  WHITE_MIN_GRAY
} from './search-window';
import {
  BuildTextArea,
  IsGlyphShaped,
  MIN_GLYPH_HEIGHT_RATIO_OF_PAGE_WIDTH
} from './text-blocks';
import type { GrayImage, TextArea } from './types';

// Lettering of shouting bubbles drawn only with speed lines, and of words
// floating over the art, has no closed paper around it. Its glyphs are found
// as separate ink marks on paper near the model box, in the near window only,
// because a wider window holds too much art.
const OPEN_TEXT_EXPAND_RATIO = SEARCH_EXPAND_RATIOS[0];

// MAX_TEXT_GAP_RATIO_OF_GLYPH bounds how far free lettering may be, so its
// blocks are scored by closeness without a further reach limit.
export const OPEN_TEXT_REACH_RATIO = Number.POSITIVE_INFINITY;
// A small box can sit off its words by more than its own size, as measured
// for a 57 px box whose top is 75 px below the top of "CELESTINE!" on a
// 1000 px wide page.
const MIN_OPEN_MARGIN_RATIO_OF_PAGE_WIDTH = 0.1;
// Measured on MangaDex: boxes sat 2 ("CELESTINE!") and 5 ("LEONHARDT-SAMA")
// letter heights off their words, while a misplaced box sat 9 letter heights
// off another region's words. Farther lettering is left to other regions.
const MAX_TEXT_GAP_RATIO_OF_GLYPH = 6;
const MIN_GLYPH_AREA_PX = 4;
// Letters are at most about 6 times the minimum letter height.
const MAX_GLYPH_SIDE_RATIO_OF_MIN_LETTER = 6;
// Lettering sits on paper: most pixels around it are white.
const MIN_PAPER_SHARE_AROUND_BLOCK = 0.5;
const PAPER_CHECK_MARGIN_RATIO_OF_GLYPH = 0.5;
// Free marks far outnumbering the source characters, such as the drops
// trailing a large brushed sound effect, are not that region's lettering.
const MAX_GLYPHS_PER_SOURCE_CHARACTER = 2;

type InkMark = { rect: Rect; ink_area_px: number; is_touching_window: boolean };

/** Collects one connected ink mark starting at the seed, marking it seen. */
function TraceInkMark(
  image: GrayImage,
  window: Rect,
  seed_index: number,
  seen: Uint8Array
): InkMark {
  const window_width_px = window.right_px - window.left_px;
  const ToSeenIndex = (x_px: number, y_px: number) =>
    (y_px - window.top_px) * window_width_px + x_px - window.left_px;
  const seed_x_px = seed_index % image.width_px;
  const seed_y_px = (seed_index - seed_x_px) / image.width_px;
  const stack = [seed_index];
  let rect: Rect = {
    left_px: seed_x_px,
    top_px: seed_y_px,
    right_px: seed_x_px + 1,
    bottom_px: seed_y_px + 1
  };
  let ink_area_px = 0;
  let is_touching_window = false;

  seen[ToSeenIndex(seed_x_px, seed_y_px)] = 1;

  while (stack.length > 0) {
    const pixel_index = stack.pop() as number;
    const x_px = pixel_index % image.width_px;
    const y_px = (pixel_index - x_px) / image.width_px;

    ink_area_px++;
    rect = UniteRects(rect, {
      left_px: x_px,
      top_px: y_px,
      right_px: x_px + 1,
      bottom_px: y_px + 1
    });

    for (const [offset_x, offset_y] of NEIGHBOR_OFFSETS_8) {
      const next_x_px = x_px + offset_x;
      const next_y_px = y_px + offset_y;

      if (
        next_x_px < window.left_px ||
        next_x_px >= window.right_px ||
        next_y_px < window.top_px ||
        next_y_px >= window.bottom_px
      ) {
        is_touching_window = true;
        continue;
      }

      const next_index = next_y_px * image.width_px + next_x_px;
      const seen_index = ToSeenIndex(next_x_px, next_y_px);

      if (seen[seen_index] === 1) continue;
      if (image.pixels[next_index] >= WHITE_MIN_GRAY) continue;

      seen[seen_index] = 1;
      stack.push(next_index);
    }
  }

  return { rect, ink_area_px, is_touching_window };
}

/** Ink marks shaped like letters that lie wholly inside the window. */
function FindGlyphsInWindow(image: GrayImage, window: Rect): Rect[] {
  const max_side_px =
    image.width_px *
    MIN_GLYPH_HEIGHT_RATIO_OF_PAGE_WIDTH *
    MAX_GLYPH_SIDE_RATIO_OF_MIN_LETTER;
  const seen = new Uint8Array(RectArea(window));
  const window_width_px = window.right_px - window.left_px;
  const glyphs: Rect[] = [];

  for (let y_px = window.top_px; y_px < window.bottom_px; y_px++) {
    for (let x_px = window.left_px; x_px < window.right_px; x_px++) {
      const pixel_index = y_px * image.width_px + x_px;
      const seen_index =
        (y_px - window.top_px) * window_width_px + x_px - window.left_px;

      if (seen[seen_index] === 1) continue;
      if (image.pixels[pixel_index] >= WHITE_MIN_GRAY) continue;

      const mark = TraceInkMark(image, window, pixel_index, seen);
      const is_glyph =
        !mark.is_touching_window &&
        mark.ink_area_px >= MIN_GLYPH_AREA_PX &&
        mark.rect.right_px - mark.rect.left_px <= max_side_px &&
        mark.rect.bottom_px - mark.rect.top_px <= max_side_px &&
        IsGlyphShaped(mark.rect, mark.ink_area_px);

      if (is_glyph) glyphs.push(mark.rect);
    }
  }

  return glyphs;
}

function MeasurePaperShare(image: GrayImage, rect: Rect): number {
  let paper_px = 0;

  for (let y_px = rect.top_px; y_px < rect.bottom_px; y_px++) {
    for (let x_px = rect.left_px; x_px < rect.right_px; x_px++) {
      if (image.pixels[y_px * image.width_px + x_px] >= WHITE_MIN_GRAY) {
        paper_px++;
      }
    }
  }

  return RectArea(rect) > 0 ? paper_px / RectArea(rect) : 0;
}

/**
 * One text area per block of free lettering near the model box, so regions
 * that reach the same block compete for it.
 */
export function FindOpenTextAreasNear(
  image: GrayImage,
  model_rect: Rect,
  character_count: number
): TextArea[] {
  const window = ComputeSearchWindow(
    image,
    model_rect,
    OPEN_TEXT_EXPAND_RATIO,
    image.width_px * MIN_OPEN_MARGIN_RATIO_OF_PAGE_WIDTH
  );
  const window_area = BuildTextArea(
    window,
    FindGlyphsInWindow(image, window),
    image.width_px,
    null
  );

  if (!window_area) return [];

  const margin_px = Math.round(
    window_area.glyph_height_px * PAPER_CHECK_MARGIN_RATIO_OF_GLYPH
  );

  return window_area.blocks
    .filter(
      block =>
        block.glyph_count <=
          character_count * MAX_GLYPHS_PER_SOURCE_CHARACTER &&
        MeasureGap(model_rect, block.rect) <=
          window_area.glyph_height_px * MAX_TEXT_GAP_RATIO_OF_GLYPH &&
        MeasurePaperShare(
          image,
          IntersectRects(ExpandRect(block.rect, margin_px), window)
        ) >= MIN_PAPER_SHARE_AROUND_BLOCK
    )
    .map(block => ({
      area_key: `open:${CreateRectKey(block.rect)}`,
      bounds: window,
      blocks: [block],
      glyph_count: block.glyph_count,
      glyph_height_px: window_area.glyph_height_px,
      pixel_labels: null
    }));
}
