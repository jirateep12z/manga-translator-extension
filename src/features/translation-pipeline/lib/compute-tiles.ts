import {
  MAX_TILE_SIDE_PX,
  TALL_IMAGE_RATIO,
  TILE_HEIGHT_RATIO,
  TILE_OVERLAP_RATIO
} from '../constants/pipeline';
import type { ImageTile } from '../types/pipeline';

function ComputeTileStarts(
  width_px: number,
  height_px: number
): {
  tile_height_px: number;
  starts_px: number[];
} {
  const tile_height_px = Math.round(width_px * TILE_HEIGHT_RATIO);
  const step_px =
    tile_height_px - Math.round(tile_height_px * TILE_OVERLAP_RATIO);
  const starts_px: number[] = [];

  for (let y_px = 0; y_px + tile_height_px < height_px; y_px += step_px) {
    starts_px.push(y_px);
  }

  starts_px.push(height_px - tile_height_px);

  return { tile_height_px, starts_px };
}

function CreateTile(
  tile_index: number,
  source_y_px: number,
  source_width_px: number,
  source_height_px: number
): ImageTile {
  const scale = Math.min(
    1,
    MAX_TILE_SIDE_PX / Math.max(source_width_px, source_height_px)
  );

  return {
    tile_index,
    source_x_px: 0,
    source_y_px,
    source_width_px,
    source_height_px,
    output_width_px: Math.max(1, Math.round(source_width_px * scale)),
    output_height_px: Math.max(1, Math.round(source_height_px * scale))
  };
}

export function ComputeTiles(width_px: number, height_px: number): ImageTile[] {
  const is_valid_size =
    Number.isFinite(width_px) &&
    Number.isFinite(height_px) &&
    width_px > 0 &&
    height_px > 0;

  if (!is_valid_size) return [];
  if (height_px / width_px <= TALL_IMAGE_RATIO) {
    return [CreateTile(0, 0, width_px, height_px)];
  }

  const { tile_height_px, starts_px } = ComputeTileStarts(width_px, height_px);

  return starts_px.map((start_px, tile_index) =>
    CreateTile(tile_index, start_px, width_px, tile_height_px)
  );
}
