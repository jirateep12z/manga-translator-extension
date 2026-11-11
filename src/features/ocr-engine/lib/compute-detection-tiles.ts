import {
  DETECTION_MAX_SIDE_PX,
  DETECTION_SIDE_STEP_PX,
  DETECTION_TILE_HEIGHT_RATIO,
  DETECTION_TILE_OVERLAP_RATIO,
  TALL_PAGE_RATIO
} from '../constants/ocr-engine';
import type { DetectionInputSize, DetectionTile } from '../types/ocr-engine';

function IsPositiveSize(size_px: number): boolean {
  return Number.isFinite(size_px) && size_px > 0;
}

function ComputeTileStarts(
  width_px: number,
  height_px: number
): {
  tile_height_px: number;
  starts_px: number[];
} {
  const tile_height_px = Math.round(width_px * DETECTION_TILE_HEIGHT_RATIO);
  const step_px =
    tile_height_px - Math.round(tile_height_px * DETECTION_TILE_OVERLAP_RATIO);
  const starts_px: number[] = [];

  for (let y_px = 0; y_px + tile_height_px < height_px; y_px += step_px) {
    starts_px.push(y_px);
  }

  starts_px.push(height_px - tile_height_px);

  return { tile_height_px, starts_px };
}

function CreateTile(
  source_y_px: number,
  source_width_px: number,
  source_height_px: number
): DetectionTile {
  return { source_x_px: 0, source_y_px, source_width_px, source_height_px };
}

function RoundToSideStep(side_px: number): number {
  return Math.max(
    DETECTION_SIDE_STEP_PX,
    Math.round(side_px / DETECTION_SIDE_STEP_PX) * DETECTION_SIDE_STEP_PX
  );
}

/**
 * Splits a page into detection tiles (spec 0002 §6.3): one tile for a page at
 * most TALL_PAGE_RATIO times as tall as it is wide, otherwise overlapping
 * full-width tiles from the top, the last one ending at the bottom edge.
 */
export function ComputeDetectionTiles(
  width_px: number,
  height_px: number
): DetectionTile[] {
  if (!IsPositiveSize(width_px) || !IsPositiveSize(height_px)) return [];
  if (height_px / width_px <= TALL_PAGE_RATIO) {
    return [CreateTile(0, width_px, height_px)];
  }

  const { tile_height_px, starts_px } = ComputeTileStarts(width_px, height_px);

  return starts_px.map(start_px =>
    CreateTile(start_px, width_px, tile_height_px)
  );
}

/**
 * Sizes the detection input for one tile (spec 0002 §6.3, as amended by
 * Section 24): the tile is scaled by `upscale`, or less when its longer side
 * would exceed DETECTION_MAX_SIDE_PX, then each side is rounded to a multiple
 * of DETECTION_SIDE_STEP_PX. The first pass never enlarges (upscale 1); the
 * second pass's crops use DETECTION_UPSCALE.
 */
export function ComputeDetectionInputSize(
  source_width_px: number,
  source_height_px: number,
  upscale = 1
): DetectionInputSize {
  const scale = Math.min(
    upscale,
    DETECTION_MAX_SIDE_PX / Math.max(source_width_px, source_height_px)
  );

  return {
    width_px: RoundToSideStep(source_width_px * scale),
    height_px: RoundToSideStep(source_height_px * scale)
  };
}
