import { CalculateLuma } from '@/lib/color';
import type { RgbColor } from '@/types/rgb-color';
import {
  DEFAULT_DARK_INK,
  DEFAULT_LIGHT_INK,
  INK_MIN_CANDIDATES,
  INK_MIN_DISTANCE,
  LIGHT_BACKGROUND_MIN_LUMA
} from '../constants/region-appearance';
import type { PixelBox, RgbaImage } from '../types/region-appearance';
import { MeasureDistanceAt, ReadMedianColor } from './pixel-sampling';

const MAX_COLOR_DISTANCE = 255;

// The median color of the half of the ink candidates farthest from the
// background, row-major among equal distances (spec 0003 §6.3). A histogram
// of distances finds that half without sorting.
export function EstimateInkColor(
  image: RgbaImage,
  box: PixelBox,
  background_color: RgbColor
): RgbColor {
  const distance_counts = new Uint32Array(MAX_COLOR_DISTANCE + 1);
  let candidate_count = 0;

  for (let y_px = box.top_px; y_px < box.bottom_px; y_px++) {
    for (let x_px = box.left_px; x_px < box.right_px; x_px++) {
      const distance = MeasureDistanceAt(
        image,
        y_px * image.width_px + x_px,
        background_color
      );

      if (distance >= INK_MIN_DISTANCE) {
        distance_counts[distance]++;
        candidate_count++;
      }
    }
  }

  if (candidate_count < INK_MIN_CANDIDATES) {
    return CalculateLuma(background_color) > LIGHT_BACKGROUND_MIN_LUMA
      ? DEFAULT_DARK_INK
      : DEFAULT_LIGHT_INK;
  }

  const kept_count = Math.ceil(candidate_count / 2);
  let farther_count = 0;
  let cutoff_distance = MAX_COLOR_DISTANCE;

  while (farther_count + distance_counts[cutoff_distance] < kept_count) {
    farther_count += distance_counts[cutoff_distance];
    cutoff_distance--;
  }

  let needed_at_cutoff_count = kept_count - farther_count;
  const kept_pixels: number[] = [];

  for (let y_px = box.top_px; y_px < box.bottom_px; y_px++) {
    for (let x_px = box.left_px; x_px < box.right_px; x_px++) {
      const pixel_index = y_px * image.width_px + x_px;
      const distance = MeasureDistanceAt(image, pixel_index, background_color);

      if (distance > cutoff_distance) {
        kept_pixels.push(pixel_index);
      } else if (distance === cutoff_distance && needed_at_cutoff_count > 0) {
        kept_pixels.push(pixel_index);
        needed_at_cutoff_count--;
      }
    }
  }

  return ReadMedianColor(image, kept_pixels);
}
