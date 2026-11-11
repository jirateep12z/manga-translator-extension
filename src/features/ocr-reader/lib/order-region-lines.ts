import type { OcrLine } from '@/features/ocr-engine';
import { LINE_ORDER_MIN_OVERLAP_RATIO } from '../constants/ocr-reader';
import {
  ComputeHorizontalOverlapPx,
  ComputeVerticalOverlapPx,
  ReadBoxRight
} from './box-geometry';
import { GroupConnected } from './group-connected';

function IsSameColumn(first: OcrLine, second: OcrLine): boolean {
  return (
    ComputeHorizontalOverlapPx(first.bbox_px, second.bbox_px) >=
    LINE_ORDER_MIN_OVERLAP_RATIO *
      Math.min(first.bbox_px.width_px, second.bbox_px.width_px)
  );
}

function IsSameRow(first: OcrLine, second: OcrLine): boolean {
  return (
    ComputeVerticalOverlapPx(first.bbox_px, second.bbox_px) >=
    LINE_ORDER_MIN_OVERLAP_RATIO *
      Math.min(first.bbox_px.height_px, second.bbox_px.height_px)
  );
}

function ComputeColumnCenterX(column: readonly OcrLine[]): number {
  const left_px = Math.min(...column.map(line => line.bbox_px.x_px));
  const right_px = Math.max(...column.map(line => ReadBoxRight(line.bbox_px)));

  return (left_px + right_px) / 2;
}

// Columns right to left, each read top to bottom.
function OrderColumns(lines: readonly OcrLine[]): OcrLine[] {
  return GroupConnected(lines, IsSameColumn)
    .map(column => ({ column, center_x_px: ComputeColumnCenterX(column) }))
    .toSorted((left, right) => right.center_x_px - left.center_x_px)
    .flatMap(({ column }) =>
      column.toSorted((upper, lower) => upper.bbox_px.y_px - lower.bbox_px.y_px)
    );
}

// Rows top to bottom, each read left to right.
function OrderRows(lines: readonly OcrLine[]): OcrLine[] {
  return GroupConnected(lines, IsSameRow)
    .map(row => ({
      row,
      top_px: Math.min(...row.map(line => line.bbox_px.y_px))
    }))
    .toSorted((upper, lower) => upper.top_px - lower.top_px)
    .flatMap(({ row }) =>
      row.toSorted((left, right) => left.bbox_px.x_px - right.bbox_px.x_px)
    );
}

/**
 * Orders the lines of one region (spec 0002 §7.3): a region whose first line
 * is vertical reads as columns, any other region as rows. Ties keep input
 * order.
 */
export function OrderRegionLines(lines: readonly OcrLine[]): OcrLine[] {
  if (lines.length === 0) return [];

  return lines[0].is_vertical ? OrderColumns(lines) : OrderRows(lines);
}
