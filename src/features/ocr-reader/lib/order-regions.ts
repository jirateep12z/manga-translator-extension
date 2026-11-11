import type { OcrLine } from '@/features/ocr-engine';
import type { ReadingDirection } from '@/features/settings';
import type { BboxPx, SourceLanguage } from '@/services/database';
import {
  AUTO_RTL_MIN_VERTICAL_SHARE,
  READING_ROW_MIN_OVERLAP_RATIO
} from '../constants/ocr-reader';
import { ReadBoxBottom } from './box-geometry';

type PageDirection = 'rtl' | 'ltr';
type ReadingRow<TRegion> = {
  top_px: number;
  bottom_px: number;
  regions: TRegion[];
};

/**
 * Resolves the page's reading direction (spec 0002 §7.4). 'auto' reads
 * Japanese, and pages where at least half of the kept lines are vertical,
 * right to left.
 */
export function ResolveReadingDirection(
  reading_direction: ReadingDirection,
  source_language: SourceLanguage,
  kept_lines: readonly OcrLine[]
): PageDirection {
  if (reading_direction !== 'auto') return reading_direction;
  if (source_language === 'ja') return 'rtl';

  const vertical_line_count = kept_lines.filter(
    line => line.is_vertical
  ).length;
  const is_mostly_vertical =
    kept_lines.length > 0 &&
    vertical_line_count >= AUTO_RTL_MIN_VERTICAL_SHARE * kept_lines.length;

  return is_mostly_vertical ? 'rtl' : 'ltr';
}

function IsInRow<TRegion>(row: ReadingRow<TRegion>, box: BboxPx): boolean {
  const overlap_px =
    Math.min(row.bottom_px, ReadBoxBottom(box)) -
    Math.max(row.top_px, box.y_px);

  return (
    overlap_px >=
    READING_ROW_MIN_OVERLAP_RATIO *
      Math.min(row.bottom_px - row.top_px, box.height_px)
  );
}

function SplitIntoRows<TRegion extends { bbox_px: BboxPx }>(
  regions: readonly TRegion[]
): ReadingRow<TRegion>[] {
  const sorted_regions = regions.toSorted(
    (upper, lower) =>
      upper.bbox_px.y_px - lower.bbox_px.y_px ||
      upper.bbox_px.x_px - lower.bbox_px.x_px
  );
  const rows: ReadingRow<TRegion>[] = [];

  for (const region of sorted_regions) {
    const current_row = rows.at(-1);

    if (current_row !== undefined && IsInRow(current_row, region.bbox_px)) {
      current_row.regions.push(region);
      current_row.top_px = Math.min(current_row.top_px, region.bbox_px.y_px);
      current_row.bottom_px = Math.max(
        current_row.bottom_px,
        ReadBoxBottom(region.bbox_px)
      );
    } else {
      rows.push({
        top_px: region.bbox_px.y_px,
        bottom_px: ReadBoxBottom(region.bbox_px),
        regions: [region]
      });
    }
  }

  return rows;
}

/**
 * Orders regions in reading order (spec 0002 §7.4): rows from the top, and
 * within a row from the right for 'rtl' or from the left for 'ltr'.
 */
export function OrderRegions<TRegion extends { bbox_px: BboxPx }>(
  regions: readonly TRegion[],
  direction: PageDirection
): TRegion[] {
  return SplitIntoRows(regions).flatMap(row =>
    row.regions.toSorted((first, second) =>
      direction === 'rtl'
        ? second.bbox_px.x_px - first.bbox_px.x_px
        : first.bbox_px.x_px - second.bbox_px.x_px
    )
  );
}
