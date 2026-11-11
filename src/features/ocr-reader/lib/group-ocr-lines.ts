import type { OcrLine } from '@/features/ocr-engine';
import type { BboxPx } from '@/services/database';
import {
  HORIZONTAL_LINK_MAX_CENTER_OFFSET_RATIO,
  HORIZONTAL_LINK_MAX_GAP_RATIO,
  HORIZONTAL_LINK_MAX_HEIGHT_RATIO,
  HORIZONTAL_LINK_MIN_OVERLAP_RATIO,
  SAME_COLUMN_MAX_GAP_RATIO,
  SAME_COLUMN_MIN_OVERLAP_RATIO,
  VERTICAL_LINK_MAX_GAP_RATIO,
  VERTICAL_LINK_MAX_TOP_OFFSET_RATIO,
  VERTICAL_LINK_MAX_WIDTH_RATIO,
  VERTICAL_LINK_MIN_OVERLAP_RATIO
} from '../constants/ocr-reader';
import {
  ComputeHorizontalOverlapPx,
  ComputeVerticalOverlapPx
} from './box-geometry';
import { GroupConnected } from './group-connected';

function ReadCenterX(box: BboxPx): number {
  return box.x_px + box.width_px / 2;
}

// Two columns side by side, or two parts of one column.
function IsVerticalLink(first: BboxPx, second: BboxPx): boolean {
  const min_width_px = Math.min(first.width_px, second.width_px);
  const max_width_px = Math.max(first.width_px, second.width_px);
  const min_height_px = Math.min(first.height_px, second.height_px);
  const horizontal_overlap_px = ComputeHorizontalOverlapPx(first, second);
  const vertical_overlap_px = ComputeVerticalOverlapPx(first, second);
  const is_side_by_side =
    max_width_px / min_width_px <= VERTICAL_LINK_MAX_WIDTH_RATIO &&
    -horizontal_overlap_px <= VERTICAL_LINK_MAX_GAP_RATIO * min_width_px &&
    (vertical_overlap_px >= VERTICAL_LINK_MIN_OVERLAP_RATIO * min_height_px ||
      Math.abs(first.y_px - second.y_px) <=
        VERTICAL_LINK_MAX_TOP_OFFSET_RATIO * min_width_px);
  const is_same_column =
    horizontal_overlap_px >= SAME_COLUMN_MIN_OVERLAP_RATIO * min_width_px &&
    -vertical_overlap_px <= SAME_COLUMN_MAX_GAP_RATIO * min_width_px;

  return is_side_by_side || is_same_column;
}

// Two stacked lines of one paragraph.
function IsHorizontalLink(first: BboxPx, second: BboxPx): boolean {
  const min_height_px = Math.min(first.height_px, second.height_px);
  const max_height_px = Math.max(first.height_px, second.height_px);
  const min_width_px = Math.min(first.width_px, second.width_px);
  const max_width_px = Math.max(first.width_px, second.width_px);
  const center_offset_px = Math.abs(ReadCenterX(first) - ReadCenterX(second));

  return (
    max_height_px / min_height_px <= HORIZONTAL_LINK_MAX_HEIGHT_RATIO &&
    -ComputeVerticalOverlapPx(first, second) <=
      HORIZONTAL_LINK_MAX_GAP_RATIO * min_height_px &&
    (ComputeHorizontalOverlapPx(first, second) >=
      HORIZONTAL_LINK_MIN_OVERLAP_RATIO * min_width_px ||
      center_offset_px <=
        HORIZONTAL_LINK_MAX_CENTER_OFFSET_RATIO * max_width_px)
  );
}

function IsLinkedLine(first: OcrLine, second: OcrLine): boolean {
  if (first.is_vertical !== second.is_vertical) return false;

  return first.is_vertical
    ? IsVerticalLink(first.bbox_px, second.bbox_px)
    : IsHorizontalLink(first.bbox_px, second.bbox_px);
}

/**
 * Groups OCR lines into speech regions (spec 0002 §7.2). Each group keeps
 * input order, and the groups are ordered by their first line's position.
 */
export function GroupOcrLines(lines: readonly OcrLine[]): OcrLine[][] {
  return GroupConnected(lines, IsLinkedLine);
}
