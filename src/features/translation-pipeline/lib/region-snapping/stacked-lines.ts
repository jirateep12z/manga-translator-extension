import {
  IntersectRects,
  MeasureAxisGap,
  MeasureAxisOverlap,
  RectArea,
  UniteRects,
  type Rect
} from './geometry';
import type { TextArea } from './types';

// Measured on MangaDex page 34: "Is because" sat 24 px above "you possess"
// with 18 px letters, inside one model box covering all three lines.
const MAX_STACKED_LINE_GAP_RATIO_OF_GLYPH = 2;
const MIN_STACKED_LINE_OVERLAP_SHARE = 0.5;
const MIN_STACKED_LINE_SHARE_IN_MODEL_BOX = 0.5;

/** Where the lines of one region's free lettering may lie. */
export type StackedLineSearch = {
  model_rect: Rect;
  other_model_rects: Rect[];
  glyph_height_px: number;
};

/**
 * True for a line of free lettering stacked over or under the text, inside
 * the model box and in no other region's box.
 */
function IsStackedLine(
  line: Rect,
  text_rect: Rect,
  search: StackedLineSearch
): boolean {
  const horizontal_overlap_px = MeasureAxisOverlap(
    line.left_px,
    line.right_px,
    text_rect.left_px,
    text_rect.right_px
  );
  const narrower_width_px = Math.min(
    line.right_px - line.left_px,
    text_rect.right_px - text_rect.left_px
  );
  const vertical_gap_px = MeasureAxisGap(
    line.top_px,
    line.bottom_px,
    text_rect.top_px,
    text_rect.bottom_px
  );

  return (
    horizontal_overlap_px >=
      narrower_width_px * MIN_STACKED_LINE_OVERLAP_SHARE &&
    vertical_gap_px <=
      search.glyph_height_px * MAX_STACKED_LINE_GAP_RATIO_OF_GLYPH &&
    RectArea(IntersectRects(line, search.model_rect)) >=
      RectArea(line) * MIN_STACKED_LINE_SHARE_IN_MODEL_BOX &&
    !search.other_model_rects.some(
      other_rect => RectArea(IntersectRects(line, other_rect)) > 0
    )
  );
}

/**
 * Adds the candidate lines of free lettering stacked with the text inside the
 * region's model box, because hand lettering can leave more than a line gap
 * between the lines of one region.
 */
export function AddStackedLines(
  text_rect: Rect,
  candidate_areas: TextArea[],
  search: StackedLineSearch
): Rect {
  let united_rect = text_rect;
  let remaining_areas = candidate_areas;
  let stacked_area: TextArea | undefined;

  do {
    stacked_area = remaining_areas.find(area =>
      IsStackedLine(area.blocks[0].rect, united_rect, search)
    );

    if (stacked_area) {
      const line = stacked_area.blocks[0].rect;

      united_rect = UniteRects(united_rect, line);
      remaining_areas = remaining_areas.filter(area => area !== stacked_area);
    }
  } while (stacked_area);

  return united_rect;
}
