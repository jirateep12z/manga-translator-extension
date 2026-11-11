import { CalculateMedian } from '@/lib/median';
import type { RegionFrame, RegionLettering } from '@/services/database';
import {
  DISPLAY_GLYPH_RATIO,
  DISPLAY_IGNORED_CHARACTERS,
  DISPLAY_LARGE_AREA_RATIO,
  DISPLAY_LARGE_HEIGHT_RATIO,
  DISPLAY_LONE_GLYPH_WIDTH_RATIO,
  DISPLAY_MAX_CHARACTERS
} from '../constants/region-appearance';
import type { PixelBox } from '../types/region-appearance';
import { ReadPixelBoxArea } from './pixel-box';

const WHITESPACE_PATTERN = /\s/gu;
const DISPLAY_IGNORED_CHARACTER_SET: ReadonlySet<string> = new Set(
  Array.from(DISPLAY_IGNORED_CHARACTERS)
);

// Code points left after removing whitespace and the characters that display
// lettering ignores (spec 0003 §6.6).
export function CountDisplayCharacters(source_text: string): number {
  return Array.from(source_text.replace(WHITESPACE_PATTERN, '')).filter(
    character => !DISPLAY_IGNORED_CHARACTER_SET.has(character)
  ).length;
}

// Large, short lettering without a frame is display lettering, and display
// lettering that covers much of a page-sized stretch is very large
// (spec 0003 §6.6).
export function ClassifyLettering(input: {
  glyph_size_px: number;
  other_glyph_sizes_px: readonly number[];
  frame: RegionFrame;
  source_text: string;
  box: PixelBox;
  image_width_px: number;
  reference_height_px: number;
}): RegionLettering {
  const {
    glyph_size_px,
    other_glyph_sizes_px,
    frame,
    source_text,
    box,
    image_width_px,
    reference_height_px
  } = input;
  const is_large =
    other_glyph_sizes_px.length > 0
      ? glyph_size_px >=
        DISPLAY_GLYPH_RATIO * CalculateMedian(other_glyph_sizes_px)
      : glyph_size_px >= DISPLAY_LONE_GLYPH_WIDTH_RATIO * image_width_px;
  const is_display =
    frame === 'open' &&
    is_large &&
    CountDisplayCharacters(source_text) <= DISPLAY_MAX_CHARACTERS;

  if (!is_display) return 'text';

  const is_very_large =
    ReadPixelBoxArea(box) >
      DISPLAY_LARGE_AREA_RATIO * image_width_px * reference_height_px ||
    box.bottom_px - box.top_px >
      DISPLAY_LARGE_HEIGHT_RATIO * reference_height_px;

  return is_very_large ? 'display_large' : 'display';
}
