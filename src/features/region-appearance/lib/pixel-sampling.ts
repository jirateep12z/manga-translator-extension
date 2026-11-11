import type { RgbColor } from '@/types/rgb-color';
import type { PixelBox, RgbaImage } from '../types/region-appearance';

const CHANNEL_VALUE_COUNT = 256;

export function ReadColorAt(image: RgbaImage, pixel_index: number): RgbColor {
  const offset = pixel_index * 4;

  return [
    image.pixels[offset],
    image.pixels[offset + 1],
    image.pixels[offset + 2]
  ];
}

// The largest of the three channel differences (spec 0003 §6.1).
export function MeasureColorDistance(
  first: RgbColor,
  second: RgbColor
): number {
  return Math.max(
    Math.abs(first[0] - second[0]),
    Math.abs(first[1] - second[1]),
    Math.abs(first[2] - second[2])
  );
}

// MeasureColorDistance from the image's bytes, without building a color.
export function MeasureDistanceAt(
  image: RgbaImage,
  pixel_index: number,
  color: RgbColor
): number {
  const offset = pixel_index * 4;

  return Math.max(
    Math.abs(image.pixels[offset] - color[0]),
    Math.abs(image.pixels[offset + 1] - color[1]),
    Math.abs(image.pixels[offset + 2] - color[2])
  );
}

// For each channel, the value at index ceil(n / 2) − 1 of the sorted values
// (spec 0003 §6.1), found from a 256-bin histogram. Throws a RangeError for
// an empty list.
export function ReadMedianColor(
  image: RgbaImage,
  pixel_indices: readonly number[]
): RgbColor {
  if (pixel_indices.length === 0) {
    throw new RangeError('ReadMedianColor needs at least one pixel.');
  }

  const histograms = [
    new Uint32Array(CHANNEL_VALUE_COUNT),
    new Uint32Array(CHANNEL_VALUE_COUNT),
    new Uint32Array(CHANNEL_VALUE_COUNT)
  ];

  for (const pixel_index of pixel_indices) {
    const offset = pixel_index * 4;

    histograms[0][image.pixels[offset]]++;
    histograms[1][image.pixels[offset + 1]]++;
    histograms[2][image.pixels[offset + 2]]++;
  }

  const median_rank = Math.ceil(pixel_indices.length / 2);

  return [
    ReadHistogramValueAtRank(histograms[0], median_rank),
    ReadHistogramValueAtRank(histograms[1], median_rank),
    ReadHistogramValueAtRank(histograms[2], median_rank)
  ];
}

// The value whose cumulative count first reaches the rank (1-based).
function ReadHistogramValueAtRank(
  histogram: Uint32Array,
  rank: number
): number {
  let cumulative_count = 0;

  for (let value = 0; value < histogram.length; value++) {
    cumulative_count += histogram[value];

    if (cumulative_count >= rank) return value;
  }

  return histogram.length - 1;
}

// Pixel indices (y × width + x) of a sampling grid that starts at the box's
// top-left pixel, in row-major order.
export function ListBoxPixels(
  box: PixelBox,
  image_width_px: number,
  step: number
): number[] {
  const pixel_indices: number[] = [];

  for (let y_px = box.top_px; y_px < box.bottom_px; y_px += step) {
    for (let x_px = box.left_px; x_px < box.right_px; x_px += step) {
      pixel_indices.push(y_px * image_width_px + x_px);
    }
  }

  return pixel_indices;
}

export function ChooseSampleStep(
  area_px: number,
  step_3_above_area_px: number,
  step_2_above_area_px: number
): number {
  if (area_px > step_3_above_area_px) return 3;
  if (area_px > step_2_above_area_px) return 2;

  return 1;
}
