// Box helpers for spec 0002 §7. A gap between two boxes is their negated
// overlap (§7.2).
import type { BboxPx } from '@/services/database';

const EMPTY_UNION_MESSAGE = 'UnionBoxes needs at least one box.';

export function ReadBoxRight(box: BboxPx): number {
  return box.x_px + box.width_px;
}

export function ReadBoxBottom(box: BboxPx): number {
  return box.y_px + box.height_px;
}

export function ComputeHorizontalOverlapPx(
  left: BboxPx,
  right: BboxPx
): number {
  return (
    Math.min(ReadBoxRight(left), ReadBoxRight(right)) -
    Math.max(left.x_px, right.x_px)
  );
}

export function ComputeVerticalOverlapPx(top: BboxPx, bottom: BboxPx): number {
  return (
    Math.min(ReadBoxBottom(top), ReadBoxBottom(bottom)) -
    Math.max(top.y_px, bottom.y_px)
  );
}

export function ComputeIntersectionAreaPx(
  first: BboxPx,
  second: BboxPx
): number {
  return (
    Math.max(0, ComputeHorizontalOverlapPx(first, second)) *
    Math.max(0, ComputeVerticalOverlapPx(first, second))
  );
}

export function UnionBoxes(boxes: readonly BboxPx[]): BboxPx {
  if (boxes.length === 0) throw new Error(EMPTY_UNION_MESSAGE);

  const left = Math.min(...boxes.map(box => box.x_px));
  const top = Math.min(...boxes.map(box => box.y_px));
  const right = Math.max(...boxes.map(ReadBoxRight));
  const bottom = Math.max(...boxes.map(ReadBoxBottom));

  return {
    x_px: left,
    y_px: top,
    width_px: right - left,
    height_px: bottom - top
  };
}
