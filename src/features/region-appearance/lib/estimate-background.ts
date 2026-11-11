import type { RegionBackdrop } from '@/services/database';
import type { RgbColor } from '@/types/rgb-color';
import {
  COLOR_BIN_BITS,
  FLAT_INTERIOR_MIN_FRACTION,
  FLAT_MAX_DISTANCE,
  FLAT_RING_MIN_FRACTION,
  FLAT_RING_WITH_INTERIOR_MIN_FRACTION,
  INK_MIN_DISTANCE,
  INTERIOR_STEP_2_ABOVE_AREA_PX,
  INTERIOR_STEP_3_ABOVE_AREA_PX,
  MODE_NEAR_MAX_DISTANCE,
  RING_STEP_2_ABOVE_AREA_PX,
  RING_STEP_3_ABOVE_AREA_PX
} from '../constants/region-appearance';
import type { PixelBox, RgbaImage } from '../types/region-appearance';
import { ExpandPixelBox, ReadPixelBoxArea } from './pixel-box';
import {
  ChooseSampleStep,
  ListBoxPixels,
  MeasureDistanceAt,
  ReadMedianColor
} from './pixel-sampling';

// The low bits a bin drops from each channel, and the channel values per bin.
const BIN_SHIFT = 8 - COLOR_BIN_BITS;
const BIN_SIZE = 1 << BIN_SHIFT;
const BIN_CHANNEL_MASK = (1 << COLOR_BIN_BITS) - 1;
const BIN_COUNT = 1 << (3 * COLOR_BIN_BITS);

// The box's pixels, on a grid chosen from its area (spec 0003 §6.3).
export function ListInteriorPixels(image: RgbaImage, box: PixelBox): number[] {
  const step = ChooseSampleStep(
    ReadPixelBoxArea(box),
    INTERIOR_STEP_3_ABOVE_AREA_PX,
    INTERIOR_STEP_2_ABOVE_AREA_PX
  );

  return ListBoxPixels(box, image.width_px, step);
}

// The pixels inside the box expanded by inner_pad + ring_width, but outside
// the box expanded by inner_pad, on a grid chosen from the outer area
// (spec 0003 §6.3).
export function ListRingPixels(
  image: RgbaImage,
  box: PixelBox,
  inner_pad_px: number,
  ring_width_px: number
): number[] {
  const outer_box = ExpandPixelBox(box, inner_pad_px + ring_width_px, image);
  const inner_box = ExpandPixelBox(box, inner_pad_px, image);
  const step = ChooseSampleStep(
    ReadPixelBoxArea(outer_box),
    RING_STEP_3_ABOVE_AREA_PX,
    RING_STEP_2_ABOVE_AREA_PX
  );
  const ring_pixels: number[] = [];

  for (let y_px = outer_box.top_px; y_px < outer_box.bottom_px; y_px += step) {
    const is_inner_row = y_px >= inner_box.top_px && y_px < inner_box.bottom_px;

    for (
      let x_px = outer_box.left_px;
      x_px < outer_box.right_px;
      x_px += step
    ) {
      const is_inner_column =
        x_px >= inner_box.left_px && x_px < inner_box.right_px;

      if (is_inner_row && is_inner_column) continue;

      ring_pixels.push(y_px * image.width_px + x_px);
    }
  }

  return ring_pixels;
}

function ReadColorBin(image: RgbaImage, pixel_index: number): number {
  const offset = pixel_index * 4;

  return (
    ((image.pixels[offset] >> BIN_SHIFT) << (2 * COLOR_BIN_BITS)) |
    ((image.pixels[offset + 1] >> BIN_SHIFT) << COLOR_BIN_BITS) |
    (image.pixels[offset + 2] >> BIN_SHIFT)
  );
}

function ToBinCenterColor(bin: number): RgbColor {
  return [
    ((bin >> (2 * COLOR_BIN_BITS)) & BIN_CHANNEL_MASK) * BIN_SIZE +
      BIN_SIZE / 2,
    ((bin >> COLOR_BIN_BITS) & BIN_CHANNEL_MASK) * BIN_SIZE + BIN_SIZE / 2,
    (bin & BIN_CHANNEL_MASK) * BIN_SIZE + BIN_SIZE / 2
  ];
}

// The median color of the samples near the most frequent color bin; the
// lowest bin index wins a tie (spec 0003 §6.3). Throws a RangeError for an
// empty list.
export function EstimateBackgroundColor(
  image: RgbaImage,
  pixel_indices: readonly number[]
): RgbColor {
  if (pixel_indices.length === 0) {
    throw new RangeError('EstimateBackgroundColor needs at least one pixel.');
  }

  const bin_counts = new Uint32Array(BIN_COUNT);

  for (const pixel_index of pixel_indices) {
    bin_counts[ReadColorBin(image, pixel_index)]++;
  }

  let mode_bin = 0;

  for (let bin = 1; bin < BIN_COUNT; bin++) {
    if (bin_counts[bin] > bin_counts[mode_bin]) mode_bin = bin;
  }

  const mode_color = ToBinCenterColor(mode_bin);
  const near_mode_pixels = pixel_indices.filter(
    pixel_index =>
      MeasureDistanceAt(image, pixel_index, mode_color) < MODE_NEAR_MAX_DISTANCE
  );

  if (near_mode_pixels.length === 0) return mode_color;

  return ReadMedianColor(image, near_mode_pixels);
}

function CountPixelsNear(
  image: RgbaImage,
  pixel_indices: readonly number[],
  color: RgbColor,
  max_distance: number
): number {
  let near_count = 0;

  for (const pixel_index of pixel_indices) {
    if (MeasureDistanceAt(image, pixel_index, color) < max_distance) {
      near_count++;
    }
  }

  return near_count;
}

// Flat when the samples around and inside the box match the background
// (spec 0003 §6.3).
export function ClassifyBackdrop(input: {
  image: RgbaImage;
  background_color: RgbColor;
  interior_pixels: readonly number[];
  ring_pixels: readonly number[];
}): RegionBackdrop {
  const { image, background_color, interior_pixels, ring_pixels } = input;
  const ring_fraction =
    ring_pixels.length === 0
      ? 0
      : CountPixelsNear(
          image,
          ring_pixels,
          background_color,
          FLAT_MAX_DISTANCE
        ) / ring_pixels.length;
  const non_ink_count = CountPixelsNear(
    image,
    interior_pixels,
    background_color,
    INK_MIN_DISTANCE
  );
  const interior_fraction =
    non_ink_count === 0
      ? 0
      : CountPixelsNear(
          image,
          interior_pixels,
          background_color,
          FLAT_MAX_DISTANCE
        ) / non_ink_count;
  const is_flat =
    (interior_fraction >= FLAT_INTERIOR_MIN_FRACTION &&
      ring_fraction >= FLAT_RING_WITH_INTERIOR_MIN_FRACTION) ||
    ring_fraction >= FLAT_RING_MIN_FRACTION;

  return is_flat ? 'flat' : 'textured';
}
