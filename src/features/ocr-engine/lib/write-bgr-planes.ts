import type { PixelNormalization } from '../types/ocr-engine';

type WriteBgrPlanesInput = {
  rgba: Uint8ClampedArray;
  width_px: number;
  height_px: number;
  normalization: PixelNormalization;
  target: Float32Array;
  target_offset: number;
  target_width_px: number;
};

const PLANE_COUNT = 3;
const RGBA_BYTES_PER_PIXEL = 4;
// Plane 0 reads blue, plane 1 green, and plane 2 red.
const PLANE_SOURCE_CHANNELS = [2, 1, 0] as const;
const PIXEL_MISMATCH_MESSAGE = 'The pixels do not match the target.';

function IsMatchingTarget(input: WriteBgrPlanesInput): boolean {
  const { rgba, width_px, height_px, target, target_offset, target_width_px } =
    input;

  return (
    rgba.length === width_px * height_px * RGBA_BYTES_PER_PIXEL &&
    target_width_px >= width_px &&
    target_offset + PLANE_COUNT * height_px * target_width_px <= target.length
  );
}

/**
 * Writes RGBA pixels into a planar BGR float tensor (spec 0002 §6.3 "Input
 * tensor" step 4, and §6.4 step 4). Each value is (value × scale − mean[c]) /
 * std[c] for plane c. Columns at or beyond width_px are left as they are, so a
 * batch item narrower than the batch keeps its padding.
 */
export function WriteBgrPlanes(input: WriteBgrPlanesInput): void {
  if (!IsMatchingTarget(input)) throw new Error(PIXEL_MISMATCH_MESSAGE);

  const { rgba, width_px, height_px, normalization, target } = input;
  const plane_size = height_px * input.target_width_px;

  for (let plane_index = 0; plane_index < PLANE_COUNT; plane_index++) {
    const plane_start = input.target_offset + plane_index * plane_size;
    const source_channel = PLANE_SOURCE_CHANNELS[plane_index];
    const mean = normalization.mean[plane_index];
    const std = normalization.std[plane_index];

    for (let y = 0; y < height_px; y++) {
      const target_row_start = plane_start + y * input.target_width_px;
      const source_row_start = y * width_px * RGBA_BYTES_PER_PIXEL;

      for (let x = 0; x < width_px; x++) {
        const source_value =
          rgba[source_row_start + x * RGBA_BYTES_PER_PIXEL + source_channel];

        target[target_row_start + x] =
          (source_value * normalization.scale - mean) / std;
      }
    }
  }
}
