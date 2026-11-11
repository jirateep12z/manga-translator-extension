import type { BboxPx } from '@/services/database';
import { VERTICAL_LINE_MIN_ASPECT_RATIO } from '../constants/ocr-engine';
import type {
  CropTransform,
  PointPx,
  QuadCrop,
  QuadPx
} from '../types/ocr-engine';

type EdgeVector = { x: number; y: number };

const UNCROPPABLE_QUAD_MESSAGE = 'The quad cannot be cropped.';

function SubtractPoints(end: PointPx, start: PointPx): EdgeVector {
  return { x: end.x_px - start.x_px, y: end.y_px - start.y_px };
}

function ComputeCrossProduct(first: EdgeVector, second: EdgeVector): number {
  return first.x * second.y - second.x * first.y;
}

// Math.sqrt, not Math.hypot: the root of an exact integer sum is correctly
// rounded, so a whole-number length stays whole and Math.trunc loses nothing.
function MeasureEdgePx(start: PointPx, end: PointPx): number {
  const edge = SubtractPoints(end, start);

  return Math.sqrt(edge.x * edge.x + edge.y * edge.y);
}

/** The corners of a box, from the top-left, clockwise. */
export function CreateBoxQuad(bbox: BboxPx): QuadPx {
  const right_px = bbox.x_px + bbox.width_px;
  const bottom_px = bbox.y_px + bbox.height_px;

  return [
    { x_px: bbox.x_px, y_px: bbox.y_px },
    { x_px: right_px, y_px: bbox.y_px },
    { x_px: right_px, y_px: bottom_px },
    { x_px: bbox.x_px, y_px: bottom_px }
  ];
}

/** The axis-aligned bounding box of a quad (spec 0002 §6.3 step 10). */
export function ComputeQuadBounds(quad: QuadPx): BboxPx {
  const x_values = quad.map(corner => corner.x_px);
  const y_values = quad.map(corner => corner.y_px);
  const left_px = Math.min(...x_values);
  const top_px = Math.min(...y_values);

  return {
    x_px: left_px,
    y_px: top_px,
    width_px: Math.max(...x_values) - left_px,
    height_px: Math.max(...y_values) - top_px
  };
}

/**
 * A quad can be cropped when its top-left, top-right, and bottom-left corners
 * turn clockwise on the screen (spec 0002 §6.3 step 9).
 */
export function IsCroppableQuad(quad: QuadPx): boolean {
  const [top_left, top_right, , bottom_left] = quad;

  return (
    ComputeCrossProduct(
      SubtractPoints(top_right, top_left),
      SubtractPoints(bottom_left, top_left)
    ) > 0
  );
}

/**
 * Measures the crop of a quad (spec 0002 §6.4 step 1): the longer edge of each
 * opposite pair, truncated to whole pixels, as the SDK's crop does.
 */
export function MeasureQuadCrop(quad: QuadPx): QuadCrop {
  const [top_left, top_right, bottom_right, bottom_left] = quad;
  const width_px = Math.trunc(
    Math.max(
      MeasureEdgePx(top_left, top_right),
      MeasureEdgePx(bottom_left, bottom_right)
    )
  );
  const height_px = Math.trunc(
    Math.max(
      MeasureEdgePx(top_left, bottom_left),
      MeasureEdgePx(top_right, bottom_right)
    )
  );

  return {
    width_px,
    height_px,
    is_vertical: height_px / width_px >= VERTICAL_LINE_MIN_ASPECT_RATIO
  };
}

/**
 * Computes the canvas matrix that warps a quad onto its crop (spec 0002 §6.4
 * step 1). It maps the top-left, top-right, and bottom-left corners, measured
 * from source_origin, to (0, 0), (width, 0), and (0, height).
 */
export function ComputeCropTransform(
  quad: QuadPx,
  crop: QuadCrop,
  source_origin: PointPx
): CropTransform {
  if (!IsCroppableQuad(quad)) throw new Error(UNCROPPABLE_QUAD_MESSAGE);

  const [top_left, top_right, , bottom_left] = quad;
  const top_edge = SubtractPoints(top_right, top_left);
  const left_edge = SubtractPoints(bottom_left, top_left);
  const cross_product = ComputeCrossProduct(top_edge, left_edge);
  const origin_offset = SubtractPoints(top_left, source_origin);
  const a = (left_edge.y * crop.width_px) / cross_product;
  const b = (-top_edge.y * crop.height_px) / cross_product;
  const c = (-left_edge.x * crop.width_px) / cross_product;
  const d = (top_edge.x * crop.height_px) / cross_product;

  return {
    a,
    b,
    c,
    d,
    e: -(a * origin_offset.x + c * origin_offset.y),
    f: -(b * origin_offset.x + d * origin_offset.y)
  };
}
