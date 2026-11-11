import {
  LETTERING_THICKNESS_QUANTILE,
  SMALL_LETTERING_MAX_THICKNESS_PX,
  SMALL_LETTERING_MIN_LINE_COUNT
} from '../constants/ocr-engine';
import type { DetectedLine } from '../types/ocr-engine';

function ReadThicknessPx(line: DetectedLine): number {
  return Math.min(line.bbox_px.width_px, line.bbox_px.height_px);
}

/**
 * Tells whether a page's first-pass lines are small lettering, which is
 * detected again on enlarged tiles (spec 0002 §6.3, as amended by Section 23).
 * A line's thickness is the shorter side of its box; the quantile is the
 * sorted thickness at index floor(LETTERING_THICKNESS_QUANTILE × (n − 1)).
 * A page with fewer than SMALL_LETTERING_MIN_LINE_COUNT lines is not small
 * lettering: one or two lines are too little evidence.
 */
export function IsSmallLettering(lines: readonly DetectedLine[]): boolean {
  if (lines.length < SMALL_LETTERING_MIN_LINE_COUNT) return false;

  const sorted_thicknesses_px = lines
    .map(ReadThicknessPx)
    .toSorted((left, right) => left - right);
  const quantile_index = Math.floor(
    LETTERING_THICKNESS_QUANTILE * (sorted_thicknesses_px.length - 1)
  );

  return (
    sorted_thicknesses_px[quantile_index] < SMALL_LETTERING_MAX_THICKNESS_PX
  );
}
