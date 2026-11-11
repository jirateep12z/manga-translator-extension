import type { BboxPx } from '@/services/database';
import {
  FUSED_PART_MIN_LENGTH_RATIO,
  STACKED_LINE_MAX_OVERLAP_RATIO,
  TILE_MERGE_MIN_OVERLAP_RATIO
} from '../constants/ocr-engine';
import type { CombinedLines, DetectedLine } from '../types/ocr-engine';
import { ComputeBoxAreaPx, ComputeBoxIntersectionAreaPx } from './box-overlap';

// A box's start and end across a first-pass line.
type AcrossExtent = { start_px: number; end_px: number };

function IsHorizontal(box: BboxPx): boolean {
  return box.width_px >= box.height_px;
}

function ReadLengthAlongPx(box: BboxPx, is_along_x: boolean): number {
  return is_along_x ? box.width_px : box.height_px;
}

function ReadAcrossExtent(box: BboxPx, is_along_x: boolean): AcrossExtent {
  return is_along_x
    ? { start_px: box.y_px, end_px: box.y_px + box.height_px }
    : { start_px: box.x_px, end_px: box.x_px + box.width_px };
}

// At least TILE_MERGE_MIN_OVERLAP_RATIO of the crop line's box lies inside the
// first-pass line's box, and the crop line is at least
// FUSED_PART_MIN_LENGTH_RATIO of the first-pass line's length along it.
function IsCoveredBy(crop_box: BboxPx, first_box: BboxPx): boolean {
  const is_along_x = IsHorizontal(first_box);

  return (
    ComputeBoxIntersectionAreaPx(crop_box, first_box) >=
      TILE_MERGE_MIN_OVERLAP_RATIO * ComputeBoxAreaPx(crop_box) &&
    ReadLengthAlongPx(crop_box, is_along_x) >=
      FUSED_PART_MIN_LENGTH_RATIO * ReadLengthAlongPx(first_box, is_along_x)
  );
}

function AreSideBySide(first: AcrossExtent, second: AcrossExtent): boolean {
  const overlap_px =
    Math.min(first.end_px, second.end_px) -
    Math.max(first.start_px, second.start_px);
  const smaller_extent_px = Math.min(
    first.end_px - first.start_px,
    second.end_px - second.start_px
  );

  return overlap_px < STACKED_LINE_MAX_OVERLAP_RATIO * smaller_extent_px;
}

// The crop reads the first-pass line as two lines side by side across it.
function IsReadAsTwoLines(
  first_line: DetectedLine,
  crop_lines: readonly DetectedLine[]
): boolean {
  const first_box = first_line.bbox_px;
  const is_along_x = IsHorizontal(first_box);
  const covered_extents = crop_lines
    .filter(crop_line => IsCoveredBy(crop_line.bbox_px, first_box))
    .map(crop_line => ReadAcrossExtent(crop_line.bbox_px, is_along_x));

  return covered_extents.some((extent, extent_index) =>
    covered_extents
      .slice(extent_index + 1)
      .some(other_extent => AreSideBySide(extent, other_extent))
  );
}

function IsSameLine(first: BboxPx, second: BboxPx): boolean {
  return (
    ComputeBoxIntersectionAreaPx(first, second) >=
    TILE_MERGE_MIN_OVERLAP_RATIO *
      Math.min(ComputeBoxAreaPx(first), ComputeBoxAreaPx(second))
  );
}

/**
 * Combines the first pass's lines with the crops' lines; the first pass wins
 * (spec 0002 Section 24, design step 6).
 *
 * - A first-pass line is horizontal when its box is at least as wide as it is
 *   tall. Its length is its width (its height when vertical), and a box's
 *   extent across it is the box's y range (its x range when vertical).
 * - A first-pass line is replaced when two crop lines that it covers lie side
 *   by side across it: their extents overlap by less than
 *   STACKED_LINE_MAX_OVERLAP_RATIO of the smaller extent. A crop line is
 *   covered when at least TILE_MERGE_MIN_OVERLAP_RATIO of its box lies inside
 *   the first-pass line's box and it is at least FUSED_PART_MIN_LENGTH_RATIO
 *   of the first-pass line's length along it. The other first-pass lines are
 *   kept, in order.
 * - A crop line is added, in order, when no kept line's box overlaps its box
 *   by at least TILE_MERGE_MIN_OVERLAP_RATIO of the smaller box's area.
 *
 * The lines are the kept first-pass lines, then the added crop lines.
 */
export function CombineCropLines(
  first_lines: readonly DetectedLine[],
  crop_lines: readonly DetectedLine[]
): CombinedLines {
  const kept_lines = first_lines.filter(
    first_line => !IsReadAsTwoLines(first_line, crop_lines)
  );
  const added_lines = crop_lines.filter(
    crop_line =>
      !kept_lines.some(kept_line =>
        IsSameLine(crop_line.bbox_px, kept_line.bbox_px)
      )
  );

  return {
    lines: [...kept_lines, ...added_lines],
    first_pass_line_count: kept_lines.length
  };
}
