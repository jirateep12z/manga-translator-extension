import { ComputeIou, IntersectRects, RectArea, type Rect } from './geometry';
import { MIN_GLYPHS_PER_BLOCK } from './text-blocks';
import type { TextArea, TextBlock } from './types';

const IOU_TIE_BREAK_WEIGHT = 0.01;
const LENGTH_MATCH_FLOOR = 0.5;
const AMBIGUOUS_SCORE_RATIO = 0.9;
// An area holds the region's text only when it has at least this many glyphs
// per non-space source character.
const MIN_GLYPHS_PER_SOURCE_CHARACTER = 0.3;
// A two-character word such as "Ah" can be just its two letters. Other text
// needs MIN_GLYPHS_PER_BLOCK glyphs, because two marks near a one-character
// box are as likely drops or specks of the art.
const TWO_LETTER_WORD_LENGTH = 2;

function ComputeMinGlyphCount(character_count: number): number {
  const min_block_glyph_count =
    character_count === TWO_LETTER_WORD_LENGTH
      ? TWO_LETTER_WORD_LENGTH
      : MIN_GLYPHS_PER_BLOCK;

  return Math.max(
    min_block_glyph_count,
    Math.ceil(character_count * MIN_GLYPHS_PER_SOURCE_CHARACTER)
  );
}

/**
 * Above 1 when the rects overlap, ranked by how much of the block the model box
 * covers, because model boxes are loose; between 0 and 1 by closeness within
 * `reach_ratio` model-box sides otherwise.
 */
function ScoreBlock(
  model_rect: Rect,
  block: Rect,
  reach_ratio: number
): number {
  const intersection_area = RectArea(IntersectRects(model_rect, block));

  if (intersection_area > 0) {
    const block_coverage = intersection_area / RectArea(block);

    return (
      1 + block_coverage + IOU_TIE_BREAK_WEIGHT * ComputeIou(model_rect, block)
    );
  }

  const center_distance_px = Math.hypot(
    (model_rect.left_px +
      model_rect.right_px -
      block.left_px -
      block.right_px) /
      2,
    (model_rect.top_px +
      model_rect.bottom_px -
      block.top_px -
      block.bottom_px) /
      2
  );
  const model_side_px = Math.max(
    model_rect.right_px - model_rect.left_px,
    model_rect.bottom_px - model_rect.top_px
  );

  return center_distance_px <= reach_ratio * model_side_px
    ? 1 / (1 + center_distance_px / model_side_px)
    : 0;
}

/** 1 when the block has one glyph per source character, falling toward 0. */
function MeasureLengthMatch(
  glyph_count: number,
  character_count: number
): number {
  if (character_count <= 0) return 1;

  return (
    Math.min(glyph_count, character_count) /
    Math.max(glyph_count, character_count)
  );
}

/**
 * Weighs the position score by how well the block's glyph count fits the
 * region's text length, which tells apart two captions one loose box covers.
 */
export function ScoreMatch(
  model_rect: Rect,
  block: TextBlock,
  character_count: number,
  reach_ratio: number
): number {
  const length_match = MeasureLengthMatch(block.glyph_count, character_count);

  return (
    ScoreBlock(model_rect, block.rect, reach_ratio) *
    (LENGTH_MATCH_FLOOR + (1 - LENGTH_MATCH_FLOOR) * length_match)
  );
}

export function PickTextArea(
  model_rect: Rect,
  areas: TextArea[],
  character_count: number,
  reach_ratio: number
): TextArea | null {
  return (
    PickScoredTextArea(model_rect, areas, character_count, reach_ratio)?.area ??
    null
  );
}

/** The best area with its match score, or null when none or two fit. */
export function PickScoredTextArea(
  model_rect: Rect,
  areas: TextArea[],
  character_count: number,
  reach_ratio: number
): { area: TextArea; score: number } | null {
  const min_glyph_count = ComputeMinGlyphCount(character_count);
  const scored_areas = areas
    .filter(area => area.glyph_count >= min_glyph_count)
    .map(area => ({
      area,
      score: Math.max(
        ...area.blocks.map(block =>
          ScoreMatch(model_rect, block, character_count, reach_ratio)
        )
      )
    }))
    .filter(scored_area => scored_area.score > 0)
    .sort((left, right) => right.score - left.score);
  const [best, runner_up] = scored_areas;

  if (!best) return null;
  // A box that fits two bubbles almost equally well would put this
  // translation over another bubble's text half of the time.
  if (runner_up && runner_up.score >= best.score * AMBIGUOUS_SCORE_RATIO) {
    return null;
  }

  return best;
}
