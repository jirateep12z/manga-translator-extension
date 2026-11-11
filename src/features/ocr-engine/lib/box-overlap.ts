import type { BboxPx } from '@/services/database';

export function ComputeBoxAreaPx(box: BboxPx): number {
  return box.width_px * box.height_px;
}

export function ComputeBoxIntersectionAreaPx(
  first: BboxPx,
  second: BboxPx
): number {
  const overlap_width_px =
    Math.min(first.x_px + first.width_px, second.x_px + second.width_px) -
    Math.max(first.x_px, second.x_px);
  const overlap_height_px =
    Math.min(first.y_px + first.height_px, second.y_px + second.height_px) -
    Math.max(first.y_px, second.y_px);

  return Math.max(0, overlap_width_px) * Math.max(0, overlap_height_px);
}
