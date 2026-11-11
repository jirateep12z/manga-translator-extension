import type { BboxPx } from '@/services/database';

/** right_px and bottom_px are exclusive. */
export type Rect = {
  left_px: number;
  top_px: number;
  right_px: number;
  bottom_px: number;
};

export const NEIGHBOR_OFFSETS_4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
] as const;
export const NEIGHBOR_OFFSETS_8 = [
  ...NEIGHBOR_OFFSETS_4,
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1]
] as const;

export function ToRect(box: BboxPx): Rect {
  return {
    left_px: box.x_px,
    top_px: box.y_px,
    right_px: box.x_px + box.width_px,
    bottom_px: box.y_px + box.height_px
  };
}

export function ToBbox(rect: Rect): BboxPx {
  return {
    x_px: rect.left_px,
    y_px: rect.top_px,
    width_px: rect.right_px - rect.left_px,
    height_px: rect.bottom_px - rect.top_px
  };
}

export function RectArea(rect: Rect): number {
  return (
    Math.max(0, rect.right_px - rect.left_px) *
    Math.max(0, rect.bottom_px - rect.top_px)
  );
}

export function IntersectRects(left: Rect, right: Rect): Rect {
  return {
    left_px: Math.max(left.left_px, right.left_px),
    top_px: Math.max(left.top_px, right.top_px),
    right_px: Math.min(left.right_px, right.right_px),
    bottom_px: Math.min(left.bottom_px, right.bottom_px)
  };
}

export function UniteRects(left: Rect, right: Rect): Rect {
  return {
    left_px: Math.min(left.left_px, right.left_px),
    top_px: Math.min(left.top_px, right.top_px),
    right_px: Math.max(left.right_px, right.right_px),
    bottom_px: Math.max(left.bottom_px, right.bottom_px)
  };
}

export function ExpandRect(rect: Rect, margin_px: number): Rect {
  return {
    left_px: rect.left_px - margin_px,
    top_px: rect.top_px - margin_px,
    right_px: rect.right_px + margin_px,
    bottom_px: rect.bottom_px + margin_px
  };
}

export function ComputeIou(left: Rect, right: Rect): number {
  const intersection_area = RectArea(IntersectRects(left, right));
  const union_area = RectArea(left) + RectArea(right) - intersection_area;

  return union_area > 0 ? intersection_area / union_area : 0;
}

/** The empty distance between two spans on one axis; 0 when they overlap. */
export function MeasureAxisGap(
  start_px: number,
  end_px: number,
  other_start_px: number,
  other_end_px: number
): number {
  return Math.max(0, other_start_px - end_px, start_px - other_end_px);
}

/** The length two spans on one axis share; 0 when they are apart. */
export function MeasureAxisOverlap(
  start_px: number,
  end_px: number,
  other_start_px: number,
  other_end_px: number
): number {
  return Math.max(
    0,
    Math.min(end_px, other_end_px) - Math.max(start_px, other_start_px)
  );
}

/** The larger of the horizontal and vertical empty distances between two rects. */
export function MeasureGap(left: Rect, right: Rect): number {
  return Math.max(
    MeasureAxisGap(left.left_px, left.right_px, right.left_px, right.right_px),
    MeasureAxisGap(left.top_px, left.bottom_px, right.top_px, right.bottom_px)
  );
}

/** The index of an image pixel in a row-by-row array that covers `bounds`. */
export function ToLocalIndex(bounds: Rect, x_px: number, y_px: number): number {
  return (
    (y_px - bounds.top_px) * (bounds.right_px - bounds.left_px) +
    x_px -
    bounds.left_px
  );
}

/** The value below which `fraction` of the values fall; values must not be empty. */
export function PercentileOf(values: number[], fraction: number): number {
  const sorted_values = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted_values.length - 1,
    Math.floor(sorted_values.length * fraction)
  );

  return sorted_values[index];
}

export function MedianOf(values: number[]): number {
  return PercentileOf(values, 0.5);
}

export function CreateRectKey(rect: Rect): string {
  return `${rect.left_px},${rect.top_px},${rect.right_px},${rect.bottom_px}`;
}
