import type { BboxPx } from '@/services/database';
import type { DocumentRect } from '../types/overlay';

export function ToContentRect(
  border_box: { left: number; top: number; width: number; height: number },
  insets: { top: number; right: number; bottom: number; left: number },
  scroll: { x: number; y: number }
): DocumentRect {
  return {
    left_px: border_box.left + insets.left + scroll.x,
    top_px: border_box.top + insets.top + scroll.y,
    width_px: border_box.width - insets.left - insets.right,
    height_px: border_box.height - insets.top - insets.bottom
  };
}

export function ScaleRegionBox(
  bbox_px: BboxPx,
  natural_size: { width_px: number; height_px: number },
  content_rect: DocumentRect
): DocumentRect {
  if (natural_size.width_px <= 0 || natural_size.height_px <= 0) {
    return {
      left_px: content_rect.left_px,
      top_px: content_rect.top_px,
      width_px: 0,
      height_px: 0
    };
  }

  const scale_x = content_rect.width_px / natural_size.width_px;
  const scale_y = content_rect.height_px / natural_size.height_px;

  return {
    left_px: content_rect.left_px + bbox_px.x_px * scale_x,
    top_px: content_rect.top_px + bbox_px.y_px * scale_y,
    width_px: bbox_px.width_px * scale_x,
    height_px: bbox_px.height_px * scale_y
  };
}
