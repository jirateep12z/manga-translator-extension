import type { BboxPx } from '@/services/database';
import {
  DROPPED_COMPONENT_MIN_BOX_SCORE,
  DROPPED_COMPONENT_MIN_MAP_PIXEL_COUNT,
  FURIGANA_MIN_THICKNESS_RATIO,
  FUSED_LINE_MIN_THICKNESS_RATIO,
  SMALL_LETTERING_MAX_THICKNESS_PX,
  SUSPECT_LINE_MAX_THICKNESS_RATIO
} from '../constants/ocr-engine';
import type {
  DetectedLine,
  DroppedComponent,
  Suspects
} from '../types/ocr-engine';

function ReadThicknessPx(box: BboxPx): number {
  return Math.min(box.width_px, box.height_px);
}

function IsVertical(box: BboxPx): boolean {
  return box.height_px > box.width_px;
}

// The larger of the gaps along x and along y, or 0 when the boxes touch or
// overlap.
function MeasureBoxGapPx(first: BboxPx, second: BboxPx): number {
  const gap_x_px =
    Math.max(first.x_px, second.x_px) -
    Math.min(first.x_px + first.width_px, second.x_px + second.width_px);
  const gap_y_px =
    Math.max(first.y_px, second.y_px) -
    Math.min(first.y_px + first.height_px, second.y_px + second.height_px);

  return Math.max(0, gap_x_px, gap_y_px);
}

// A vertical line with another vertical line at least
// FURIGANA_MIN_THICKNESS_RATIO times as thick within its own thickness.
function IsFuriganaLike(
  line_boxes: readonly BboxPx[],
  line_index: number
): boolean {
  const line_box = line_boxes[line_index];

  if (!IsVertical(line_box)) return false;

  const thickness_px = ReadThicknessPx(line_box);

  return line_boxes.some(
    (other_box, other_index) =>
      other_index !== line_index &&
      IsVertical(other_box) &&
      ReadThicknessPx(other_box) >=
        FURIGANA_MIN_THICKNESS_RATIO * thickness_px &&
      MeasureBoxGapPx(line_box, other_box) <= thickness_px
  );
}

function ListThinLineIndices(line_boxes: readonly BboxPx[]): Set<number> {
  const thin_line_indices = new Set<number>();

  for (const [line_index, line_box] of line_boxes.entries()) {
    if (ReadThicknessPx(line_box) >= SMALL_LETTERING_MAX_THICKNESS_PX) continue;
    if (IsFuriganaLike(line_boxes, line_index)) continue;

    thin_line_indices.add(line_index);
  }

  return thin_line_indices;
}

// The sorted value at index floor((n − 1) / 2), or null when there is none.
function ReadLowerMedianPx(thicknesses_px: readonly number[]): number | null {
  if (thicknesses_px.length === 0) return null;

  const sorted_thicknesses_px = thicknesses_px.toSorted(
    (left, right) => left - right
  );

  return sorted_thicknesses_px[
    Math.floor((sorted_thicknesses_px.length - 1) / 2)
  ];
}

function IsFusedLooking(
  line_box: BboxPx,
  reference_thickness_px: number | null
): boolean {
  if (reference_thickness_px === null) return false;

  const thickness_px = ReadThicknessPx(line_box);

  return (
    thickness_px >= FUSED_LINE_MIN_THICKNESS_RATIO * reference_thickness_px &&
    thickness_px <
      SUSPECT_LINE_MAX_THICKNESS_RATIO * SMALL_LETTERING_MAX_THICKNESS_PX
  );
}

function IsDroppedSuspect(component: DroppedComponent): boolean {
  return (
    component.map_pixel_count >= DROPPED_COMPONENT_MIN_MAP_PIXEL_COUNT &&
    component.box_score >= DROPPED_COMPONENT_MIN_BOX_SCORE
  );
}

/**
 * Picks the text that the second pass reads again (spec 0002 Section 24,
 * design step 2). A line's thickness is the shorter side of its box, and a
 * line is vertical when its box is taller than it is wide.
 *
 * - A line is furigana-like when it is vertical and another vertical line at
 *   least FURIGANA_MIN_THICKNESS_RATIO times as thick lies within the first
 *   line's own thickness of it (the larger of the gaps along x and along y).
 * - Thin lines are thinner than SMALL_LETTERING_MAX_THICKNESS_PX and not
 *   furigana-like. The reference thickness is their lower median, or null
 *   when there is no thin line.
 * - Fused-looking lines, when there is a reference, are at least
 *   FUSED_LINE_MIN_THICKNESS_RATIO times the reference and thinner than
 *   SUSPECT_LINE_MAX_THICKNESS_RATIO times SMALL_LETTERING_MAX_THICKNESS_PX.
 * - Dropped suspects have at least DROPPED_COMPONENT_MIN_MAP_PIXEL_COUNT map
 *   pixels and a box score of at least DROPPED_COMPONENT_MIN_BOX_SCORE.
 *
 * The boxes keep their input order, with each line's box at most once.
 */
export function SelectSuspects(
  lines: readonly DetectedLine[],
  dropped_components: readonly DroppedComponent[]
): Suspects {
  const line_boxes = lines.map(line => line.bbox_px);
  const thin_line_indices = ListThinLineIndices(line_boxes);
  const reference_thickness_px = ReadLowerMedianPx(
    [...thin_line_indices].map(line_index =>
      ReadThicknessPx(line_boxes[line_index])
    )
  );

  return {
    line_boxes: line_boxes.filter(
      (line_box, line_index) =>
        thin_line_indices.has(line_index) ||
        IsFusedLooking(line_box, reference_thickness_px)
    ),
    dropped_boxes: dropped_components
      .filter(IsDroppedSuspect)
      .map(component => component.bbox_px),
    reference_thickness_px
  };
}
