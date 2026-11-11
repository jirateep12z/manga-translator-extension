import {
  LUMA_BLUE_WEIGHT,
  LUMA_GREEN_WEIGHT,
  LUMA_RED_WEIGHT
} from '@/lib/color';

// One rounded BT.601 luma value for each pixel; alpha is ignored.
export function ConvertRgbaToGray(
  rgba: Uint8ClampedArray,
  width_px: number,
  height_px: number
): Uint8Array {
  const pixels = new Uint8Array(width_px * height_px);

  for (let pixel_index = 0; pixel_index < pixels.length; pixel_index++) {
    const offset = pixel_index * 4;

    pixels[pixel_index] = Math.round(
      LUMA_RED_WEIGHT * rgba[offset] +
        LUMA_GREEN_WEIGHT * rgba[offset + 1] +
        LUMA_BLUE_WEIGHT * rgba[offset + 2]
    );
  }

  return pixels;
}
