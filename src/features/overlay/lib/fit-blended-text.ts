import { MIN_OVERLAY_FONT_PX } from '../constants/overlay';
import type { BlendedFit } from '../types/overlay';
import { FitOverlayText } from './fit-overlay-text';

/**
 * Fits blended text so it keeps whole words at the largest size that fits
 * (spec 0003 §8.4). A word splits only when it is wider than the box even at
 * the minimum size.
 */
export function FitBlendedText(input: {
  box_width_px: number;
  box_height_px: number;
  max_font_size_px: number;
  MeasureTextHeight: (font_size_px: number) => number;
  MeasureWidestWordWidth: (font_size_px: number) => number;
}): BlendedFit {
  const IsWordSplit = (font_size_px: number) =>
    input.MeasureWidestWordWidth(font_size_px) > input.box_width_px;

  if (IsWordSplit(MIN_OVERLAY_FONT_PX)) {
    return {
      ...FitOverlayText({
        box_width_px: input.box_width_px,
        box_height_px: input.box_height_px,
        MeasureTextHeight: input.MeasureTextHeight,
        max_font_size_px: MIN_OVERLAY_FONT_PX
      }),
      is_word_split: true
    };
  }

  return {
    ...FitOverlayText({
      box_width_px: input.box_width_px,
      box_height_px: input.box_height_px,
      max_font_size_px: input.max_font_size_px,
      // A size that would split a word counts as too tall, so the search keeps
      // words whole. No word splits at the minimum size, so FitOverlayText's
      // growth there keeps them whole too.
      MeasureTextHeight: font_size_px =>
        IsWordSplit(font_size_px)
          ? Number.POSITIVE_INFINITY
          : input.MeasureTextHeight(font_size_px)
    }),
    is_word_split: false
  };
}
