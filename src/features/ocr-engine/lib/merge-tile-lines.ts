import { TILE_MERGE_MIN_OVERLAP_RATIO } from '../constants/ocr-engine';
import type { DetectedLine } from '../types/ocr-engine';
import { ComputeBoxAreaPx, ComputeBoxIntersectionAreaPx } from './box-overlap';

type NumberedLine = { tile_index: number; line: DetectedLine };

// The first line comes from an earlier tile, so it wins a tie in area.
function FindDroppedIndex(
  numbered_lines: readonly NumberedLine[],
  first_index: number,
  second_index: number
): number | null {
  const first_box = numbered_lines[first_index].line.bbox_px;
  const second_box = numbered_lines[second_index].line.bbox_px;
  const first_area = ComputeBoxAreaPx(first_box);
  const second_area = ComputeBoxAreaPx(second_box);
  const overlap_area = ComputeBoxIntersectionAreaPx(first_box, second_box);

  if (
    overlap_area <
    TILE_MERGE_MIN_OVERLAP_RATIO * Math.min(first_area, second_area)
  ) {
    return null;
  }

  return first_area < second_area ? first_index : second_index;
}

/**
 * Merges the lines of overlapping detection tiles (spec 0002 §6.3, "Tile
 * merge"). When the boxes of two lines from different tiles overlap by at
 * least TILE_MERGE_MIN_OVERLAP_RATIO of the smaller box, the line with the
 * smaller box is dropped. Every pair is checked; the lines left keep tile
 * order, then in-tile order, together with their quads.
 */
export function MergeTileLines(
  tile_lines: readonly (readonly DetectedLine[])[]
): DetectedLine[] {
  const numbered_lines: NumberedLine[] = tile_lines.flatMap(
    (lines, tile_index) => lines.map(line => ({ tile_index, line }))
  );
  const dropped_indices = new Set<number>();

  for (
    let first_index = 0;
    first_index < numbered_lines.length;
    first_index++
  ) {
    for (
      let second_index = first_index + 1;
      second_index < numbered_lines.length;
      second_index++
    ) {
      const is_same_tile =
        numbered_lines[first_index].tile_index ===
        numbered_lines[second_index].tile_index;

      if (is_same_tile) continue;

      const dropped_index = FindDroppedIndex(
        numbered_lines,
        first_index,
        second_index
      );

      if (dropped_index !== null) dropped_indices.add(dropped_index);
    }
  }

  return numbered_lines
    .filter((_, line_index) => !dropped_indices.has(line_index))
    .map(numbered_line => numbered_line.line);
}
