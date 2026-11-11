import {
  CreateRectKey,
  MeasureAxisGap,
  MeasureGap,
  MedianOf,
  PercentileOf,
  RectArea,
  UniteRects,
  type Rect
} from './geometry';
import type { TextArea, TextBlock } from './types';

const LETTER_GAP_RATIO_OF_GLYPH = 0.6;
// Hand lettering often leaves about a line height between lines. The line
// height is that of the tall letters: in mixed-case lettering most letters
// are only x-height tall, and MangaDex lines sat up to about 1.5 x-heights
// apart ("or that" / "now").
const LINE_GAP_RATIO_OF_LINE_HEIGHT = 1;
const LINE_HEIGHT_PERCENTILE = 0.8;

export const MIN_GLYPHS_PER_BLOCK = 3;
// Short words can be lettered with two glyphs, as "Yes..." on MangaDex was
// a "Y", a joined "es" and three dots.
const MIN_LETTERS_PER_BLOCK = 2;
const MIN_LETTER_SHARE_OF_BLOCK = 0.5;
// Periods and the dots of an ellipsis sit on the baseline of the letters
// beside them, as in "Ce... lia..." on MangaDex, where the dots outnumber the
// letters. Specks of the art do not line up with letter bottoms.
const BASELINE_TOLERANCE_RATIO_OF_GLYPH = 0.15;
const MAX_PUNCTUATION_ASPECT_RATIO = 2;
// An ellipsis can stand on its own line, more than a line gap from its words,
// as in "Wait, that's / ..." on MangaDex.
const MIN_DOTS_PER_ELLIPSIS = 2;
const MAX_ELLIPSIS_GAP_RATIO_OF_LINE_HEIGHT = 2;
// Glyph boxes cover a good part of a block of lettering; the strokes of a
// ring of speed lines around a bubble are spread thin over a large rect.
const MIN_GLYPH_BOX_SHARE_OF_BLOCK = 0.2;
// The letters of one block share a height. A mark several letters tall
// within a letter gap of the words, as the tip of a character's hair three
// letter heights tall beside "suited her" on MangaDex page 30, is art.
const MAX_GLYPH_HEIGHT_RATIO_OF_BLOCK_LETTERS = 2.5;

// Lettering is at least about 1% of the page width tall; specks and
// stippling in the art are smaller.
export const MIN_GLYPH_HEIGHT_RATIO_OF_PAGE_WIDTH = 0.008;

// Measured on MangaDex pages: letters fill at least about 40% of their box
// and are at most about 4 times longer than wide, while speed lines are
// diagonal hairlines filling under 25% of their box or straight strokes over
// 7 times longer than thick.
const MIN_GLYPH_INK_SHARE = 0.25;
const MAX_GLYPH_ASPECT_RATIO = 6;

/** False for speed lines and hatching that are drawn as single strokes. */
export function IsGlyphShaped(glyph: Rect, ink_area_px: number): boolean {
  const width_px = glyph.right_px - glyph.left_px;
  const height_px = glyph.bottom_px - glyph.top_px;

  return (
    ink_area_px >= RectArea(glyph) * MIN_GLYPH_INK_SHARE &&
    Math.max(width_px, height_px) <=
      Math.min(width_px, height_px) * MAX_GLYPH_ASPECT_RATIO
  );
}

/** Letters next to each other, or stacked lines whose columns overlap. */
function IsSameBlock(
  left: Rect,
  right: Rect,
  letter_gap_px: number,
  line_gap_px: number
): boolean {
  const horizontal_gap_px = MeasureAxisGap(
    left.left_px,
    left.right_px,
    right.left_px,
    right.right_px
  );
  const vertical_gap_px = MeasureAxisGap(
    left.top_px,
    left.bottom_px,
    right.top_px,
    right.bottom_px
  );

  return (
    MeasureGap(left, right) <= letter_gap_px ||
    (horizontal_gap_px === 0 && vertical_gap_px <= line_gap_px)
  );
}

function IsDenseEnough(block: TextBlock): boolean {
  return (
    block.glyph_box_area_px >=
    RectArea(block.rect) * MIN_GLYPH_BOX_SHARE_OF_BLOCK
  );
}

function IsRoundMark(mark: Rect): boolean {
  const width_px = mark.right_px - mark.left_px;
  const height_px = mark.bottom_px - mark.top_px;

  return (
    Math.max(width_px, height_px) <=
    Math.min(width_px, height_px) * MAX_PUNCTUATION_ASPECT_RATIO
  );
}

/** A small round mark whose bottom lines up with a letter's bottom. */
function IsBaselinePunctuation(
  mark: Rect,
  letters: Rect[],
  tolerance_px: number
): boolean {
  return (
    IsRoundMark(mark) &&
    letters.some(
      letter => Math.abs(letter.bottom_px - mark.bottom_px) <= tolerance_px
    )
  );
}

/** Small round marks side by side on one baseline. */
function IsDotRow(
  glyphs: Rect[],
  min_letter_height_px: number,
  baseline_tolerance_px: number
): boolean {
  const bottoms_px = glyphs.map(glyph => glyph.bottom_px);

  return (
    glyphs.length >= MIN_DOTS_PER_ELLIPSIS &&
    glyphs.every(
      glyph =>
        glyph.bottom_px - glyph.top_px < min_letter_height_px &&
        IsRoundMark(glyph)
    ) &&
    Math.max(...bottoms_px) - Math.min(...bottoms_px) <= baseline_tolerance_px
  );
}

/** Drops the marks of a group far taller than its letters. */
function DropOversizedMarks(
  glyph_group: Rect[],
  min_letter_height_px: number
): Rect[] {
  const letter_heights_px = glyph_group
    .map(glyph => glyph.bottom_px - glyph.top_px)
    .filter(height_px => height_px >= min_letter_height_px);

  if (letter_heights_px.length === 0) return glyph_group;

  const max_height_px =
    MedianOf(letter_heights_px) * MAX_GLYPH_HEIGHT_RATIO_OF_BLOCK_LETTERS;

  return glyph_group.filter(
    glyph => glyph.bottom_px - glyph.top_px <= max_height_px
  );
}

function ToTextBlock(glyphs: Rect[]): TextBlock {
  return {
    rect: glyphs.reduce(UniteRects),
    glyph_count: glyphs.length,
    glyph_box_area_px: glyphs.reduce((sum, glyph) => sum + RectArea(glyph), 0)
  };
}

/** The nearest block above or below whose columns hold the dot row. */
function FindEllipsisBlock(
  dot_row: Rect,
  blocks: TextBlock[],
  max_gap_px: number
): TextBlock | null {
  const center_x_px = (dot_row.left_px + dot_row.right_px) / 2;
  let nearest: { block: TextBlock; gap_px: number } | null = null;

  for (const block of blocks) {
    const gap_px = MeasureAxisGap(
      block.rect.top_px,
      block.rect.bottom_px,
      dot_row.top_px,
      dot_row.bottom_px
    );
    const is_in_columns =
      center_x_px >= block.rect.left_px && center_x_px <= block.rect.right_px;

    if (!is_in_columns || gap_px > max_gap_px) continue;
    if (!nearest || gap_px < nearest.gap_px) nearest = { block, gap_px };
  }

  return nearest?.block ?? null;
}

/**
 * Joins each row of ellipsis dots to the nearest block of lettering above or
 * below it, so the box covers an ellipsis set on its own line.
 */
function AttachEllipses(
  lettering_blocks: TextBlock[],
  glyph_groups: Rect[][],
  dot_row_metrics: {
    min_letter_height_px: number;
    baseline_tolerance_px: number;
    max_gap_px: number;
  }
): TextBlock[] {
  const { min_letter_height_px, baseline_tolerance_px, max_gap_px } =
    dot_row_metrics;
  const ellipsis_glyphs = new Map<TextBlock, Rect[]>();

  for (const glyph_group of glyph_groups) {
    if (!IsDotRow(glyph_group, min_letter_height_px, baseline_tolerance_px)) {
      continue;
    }

    const block = FindEllipsisBlock(
      glyph_group.reduce(UniteRects),
      lettering_blocks,
      max_gap_px
    );

    if (block) {
      ellipsis_glyphs.set(block, [
        ...(ellipsis_glyphs.get(block) ?? []),
        ...glyph_group
      ]);
    }
  }

  return lettering_blocks.map(block => {
    const dots = ellipsis_glyphs.get(block);

    if (!dots) return block;

    const dot_block = ToTextBlock(dots);

    return {
      rect: UniteRects(block.rect, dot_block.rect),
      glyph_count: block.glyph_count + dot_block.glyph_count,
      glyph_box_area_px: block.glyph_box_area_px + dot_block.glyph_box_area_px
    };
  });
}

/** Most glyphs of lettering are letter-tall, not counting its punctuation. */
function IsLettering(
  glyphs: Rect[],
  min_letter_height_px: number,
  baseline_tolerance_px: number
): boolean {
  const letters = glyphs.filter(
    glyph => glyph.bottom_px - glyph.top_px >= min_letter_height_px
  );
  const punctuation_count = glyphs.filter(
    glyph =>
      glyph.bottom_px - glyph.top_px < min_letter_height_px &&
      IsBaselinePunctuation(glyph, letters, baseline_tolerance_px)
  ).length;

  return (
    letters.length >= MIN_LETTERS_PER_BLOCK &&
    letters.length >=
      (glyphs.length - punctuation_count) * MIN_LETTER_SHARE_OF_BLOCK
  );
}

/**
 * Groups glyphs closer than a fraction of the glyph height into text blocks.
 * A block is lettering only when most of its glyphs are letter-tall; hatching
 * is mostly specks and hairlines.
 */
function GroupGlyphsIntoBlocks(
  glyphs: Rect[],
  letter_metrics: {
    glyph_height_px: number;
    line_height_px: number;
    min_letter_height_px: number;
  }
): TextBlock[] {
  const { glyph_height_px, line_height_px, min_letter_height_px } =
    letter_metrics;
  const letter_gap_px = Math.max(
    2,
    Math.round(glyph_height_px * LETTER_GAP_RATIO_OF_GLYPH)
  );
  const line_gap_px = Math.max(
    letter_gap_px,
    Math.round(line_height_px * LINE_GAP_RATIO_OF_LINE_HEIGHT)
  );
  const parents = glyphs.map((_glyph, index) => index);
  const FindRoot = (index: number): number => {
    let root = index;

    while (parents[root] !== root) root = parents[root];
    parents[index] = root;

    return root;
  };

  for (let left = 0; left < glyphs.length; left++) {
    for (let right = left + 1; right < glyphs.length; right++) {
      if (
        IsSameBlock(glyphs[left], glyphs[right], letter_gap_px, line_gap_px)
      ) {
        parents[FindRoot(right)] = FindRoot(left);
      }
    }
  }

  const glyph_groups = new Map<number, Rect[]>();

  for (const [index, glyph] of glyphs.entries()) {
    const root = FindRoot(index);
    const glyph_group = glyph_groups.get(root);

    if (glyph_group) glyph_group.push(glyph);
    else glyph_groups.set(root, [glyph]);
  }

  const baseline_tolerance_px = Math.max(
    1,
    Math.round(glyph_height_px * BASELINE_TOLERANCE_RATIO_OF_GLYPH)
  );
  const trimmed_glyph_groups = [...glyph_groups.values()].map(glyph_group =>
    DropOversizedMarks(glyph_group, min_letter_height_px)
  );
  // Specks of ink in a white pocket of the art are not text.
  const lettering_blocks = trimmed_glyph_groups
    .filter(glyph_group =>
      IsLettering(glyph_group, min_letter_height_px, baseline_tolerance_px)
    )
    .map(ToTextBlock)
    .filter(IsDenseEnough);

  return AttachEllipses(lettering_blocks, trimmed_glyph_groups, {
    min_letter_height_px,
    baseline_tolerance_px,
    max_gap_px: line_height_px * MAX_ELLIPSIS_GAP_RATIO_OF_LINE_HEIGHT
  });
}

/** Returns null when the glyphs are too small or too few to be lettering. */
export function BuildTextArea(
  bounds: Rect,
  glyphs: Rect[],
  image_width_px: number,
  pixel_labels: Uint8Array | null
): TextArea | null {
  const min_letter_height_px =
    image_width_px * MIN_GLYPH_HEIGHT_RATIO_OF_PAGE_WIDTH;
  // Dots and specks would pull the measured height below the letters' height.
  const letter_heights_px = glyphs
    .map(glyph => glyph.bottom_px - glyph.top_px)
    .filter(height_px => height_px >= min_letter_height_px);

  if (letter_heights_px.length === 0) return null;

  const glyph_height_px = MedianOf(letter_heights_px);
  const blocks = GroupGlyphsIntoBlocks(glyphs, {
    glyph_height_px,
    line_height_px: PercentileOf(letter_heights_px, LINE_HEIGHT_PERCENTILE),
    min_letter_height_px
  });

  if (blocks.length === 0) return null;

  return {
    area_key: CreateRectKey(bounds),
    bounds,
    blocks,
    glyph_count: blocks.reduce((sum, block) => sum + block.glyph_count, 0),
    glyph_height_px,
    pixel_labels
  };
}
