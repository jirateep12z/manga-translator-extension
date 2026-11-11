import type { BboxPx } from '@/services/database';
import { REFERENCE_HEIGHT_TO_WIDTH_RATIO } from '../constants/region-appearance';
import type { ImageSize, PixelBox } from '../types/region-appearance';

function ClipToRange(value: number, maximum: number): number {
  return Math.min(Math.max(value, 0), maximum);
}

// Scales a page box to decoded pixels and clips it to the image
// (spec 0003 §6.1).
export function ToPixelBox(
  bbox_px: BboxPx,
  scale: number,
  image_size: ImageSize
): PixelBox {
  return {
    left_px: ClipToRange(Math.round(bbox_px.x_px * scale), image_size.width_px),
    top_px: ClipToRange(Math.round(bbox_px.y_px * scale), image_size.height_px),
    right_px: ClipToRange(
      Math.round((bbox_px.x_px + bbox_px.width_px) * scale),
      image_size.width_px
    ),
    bottom_px: ClipToRange(
      Math.round((bbox_px.y_px + bbox_px.height_px) * scale),
      image_size.height_px
    )
  };
}

export function ExpandPixelBox(
  box: PixelBox,
  pad_px: number,
  image_size: ImageSize
): PixelBox {
  return {
    left_px: ClipToRange(box.left_px - pad_px, image_size.width_px),
    top_px: ClipToRange(box.top_px - pad_px, image_size.height_px),
    right_px: ClipToRange(box.right_px + pad_px, image_size.width_px),
    bottom_px: ClipToRange(box.bottom_px + pad_px, image_size.height_px)
  };
}

export function ClipPixelBox(box: PixelBox, image_size: ImageSize): PixelBox {
  return ExpandPixelBox(box, 0, image_size);
}

export function IntersectPixelBoxes(
  first: PixelBox,
  second: PixelBox
): PixelBox {
  return {
    left_px: Math.max(first.left_px, second.left_px),
    top_px: Math.max(first.top_px, second.top_px),
    right_px: Math.min(first.right_px, second.right_px),
    bottom_px: Math.min(first.bottom_px, second.bottom_px)
  };
}

export function IsPixelInBox(
  box: PixelBox,
  x_px: number,
  y_px: number
): boolean {
  return (
    x_px >= box.left_px &&
    x_px < box.right_px &&
    y_px >= box.top_px &&
    y_px < box.bottom_px
  );
}

export function IsEmptyPixelBox(box: PixelBox): boolean {
  return box.right_px <= box.left_px || box.bottom_px <= box.top_px;
}

export function ReadPixelBoxArea(box: PixelBox): number {
  return (box.right_px - box.left_px) * (box.bottom_px - box.top_px);
}

// True when the intersection has a positive width and height.
export function IsPixelBoxOverlapping(
  first: PixelBox,
  second: PixelBox
): boolean {
  return (
    Math.min(first.right_px, second.right_px) >
      Math.max(first.left_px, second.left_px) &&
    Math.min(first.bottom_px, second.bottom_px) >
      Math.max(first.top_px, second.top_px)
  );
}

// Maps a decoded box back to page pixels and clips it to the page. Returns
// null when the box becomes empty (spec 0003 §6.8).
export function ToPageBox(
  box: PixelBox,
  scale: number,
  page_size: ImageSize
): BboxPx | null {
  const x_px = Math.max(0, Math.round(box.left_px / scale));
  const y_px = Math.max(0, Math.round(box.top_px / scale));
  const right_px = Math.min(
    page_size.width_px,
    Math.round(box.right_px / scale)
  );
  const bottom_px = Math.min(
    page_size.height_px,
    Math.round(box.bottom_px / scale)
  );
  const width_px = right_px - x_px;
  const height_px = bottom_px - y_px;

  if (width_px <= 0 || height_px <= 0) return null;

  return { x_px, y_px, width_px, height_px };
}

// H_ref: the image height, at most one and a half widths (spec 0003 §6.1).
export function ComputeReferenceHeight(image_size: ImageSize): number {
  return Math.min(
    image_size.height_px,
    REFERENCE_HEIGHT_TO_WIDTH_RATIO * image_size.width_px
  );
}
