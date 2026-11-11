import type { RgbColor } from '@/types/rgb-color';
import {
  MAX_SEARCH_WINDOW_PIXELS,
  PAPER_MAX_DISTANCE,
  SEARCH_REACH_RATIO,
  SEED_STEP
} from '../constants/region-appearance';
import type {
  ImageSize,
  PixelBox,
  RgbaImage
} from '../types/region-appearance';
import { ExpandPixelBox } from './pixel-box';
import { ListBoxPixels, MeasureDistanceAt } from './pixel-sampling';

// filled holds one byte for each window pixel, in window row-major order, set
// to 1 for filled pixels.
export type PaperFill = {
  window: PixelBox;
  filled: Uint8Array;
  filled_count: number;
  is_reaching_edge: boolean;
};

function ReadWindowArea(
  width_px: number,
  height_px: number,
  reach_px: number
): number {
  return (width_px + 2 * reach_px) * (height_px + 2 * reach_px);
}

// The box expanded by its reach and clipped to the image, or null when even
// the box alone exceeds the window limit (spec 0003 §6.4).
export function ComputeSearchWindow(
  box: PixelBox,
  image_size: ImageSize,
  reference_height_px: number
): PixelBox | null {
  const width_px = box.right_px - box.left_px;
  const height_px = box.bottom_px - box.top_px;

  if (width_px * height_px > MAX_SEARCH_WINDOW_PIXELS) return null;

  let reach_px = Math.round(
    Math.max(width_px, height_px) + SEARCH_REACH_RATIO * reference_height_px
  );

  if (
    ReadWindowArea(width_px, height_px, reach_px) > MAX_SEARCH_WINDOW_PIXELS
  ) {
    let low_px = 0;
    let high_px = reach_px;

    reach_px = 0;

    while (low_px <= high_px) {
      const middle_px = Math.floor((low_px + high_px) / 2);

      if (
        ReadWindowArea(width_px, height_px, middle_px) <=
        MAX_SEARCH_WINDOW_PIXELS
      ) {
        reach_px = middle_px;
        low_px = middle_px + 1;
      } else {
        high_px = middle_px - 1;
      }
    }
  }

  return ExpandPixelBox(box, reach_px, image_size);
}

// The ring samples, then every second pixel of the box (spec 0003 §6.4).
export function ListSeedPixels(
  image: RgbaImage,
  box: PixelBox,
  ring_pixels: readonly number[]
): number[] {
  return [...ring_pixels, ...ListBoxPixels(box, image.width_px, SEED_STEP)];
}

// A 4-connected fill over the window's paper pixels from the seeds that are
// paper, without recursion (spec 0003 §6.4).
export function FloodPaper(input: {
  image: RgbaImage;
  window: PixelBox;
  seed_pixels: readonly number[];
  background_color: RgbColor;
}): PaperFill {
  const { image, window, seed_pixels, background_color } = input;
  const window_width_px = window.right_px - window.left_px;
  const window_height_px = window.bottom_px - window.top_px;
  const filled = new Uint8Array(window_width_px * window_height_px);
  const pending_pixels: number[] = [];
  let filled_count = 0;
  let is_reaching_edge = false;

  function FillIfPaper(column: number, row: number): void {
    const window_index = row * window_width_px + column;

    if (filled[window_index] === 1) return;

    const image_index =
      (window.top_px + row) * image.width_px + window.left_px + column;

    if (
      MeasureDistanceAt(image, image_index, background_color) >=
      PAPER_MAX_DISTANCE
    ) {
      return;
    }

    filled[window_index] = 1;
    filled_count++;

    if (
      row === 0 ||
      row === window_height_px - 1 ||
      column === 0 ||
      column === window_width_px - 1
    ) {
      is_reaching_edge = true;
    }

    pending_pixels.push(window_index);
  }

  for (const seed_pixel of seed_pixels) {
    const x_px = seed_pixel % image.width_px;
    const y_px = (seed_pixel - x_px) / image.width_px;

    if (
      x_px >= window.left_px &&
      x_px < window.right_px &&
      y_px >= window.top_px &&
      y_px < window.bottom_px
    ) {
      FillIfPaper(x_px - window.left_px, y_px - window.top_px);
    }
  }

  for (
    let window_index = pending_pixels.pop();
    window_index !== undefined;
    window_index = pending_pixels.pop()
  ) {
    const column = window_index % window_width_px;
    const row = (window_index - column) / window_width_px;

    if (column > 0) FillIfPaper(column - 1, row);
    if (column < window_width_px - 1) FillIfPaper(column + 1, row);
    if (row > 0) FillIfPaper(column, row - 1);
    if (row < window_height_px - 1) FillIfPaper(column, row + 1);
  }

  return { window, filled, filled_count, is_reaching_edge };
}
