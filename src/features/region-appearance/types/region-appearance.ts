import type { TextRegion } from '@/services/database';

export type RgbaImage = {
  pixels: Uint8ClampedArray;
  width_px: number;
  height_px: number;
};
export type ImageSize = { width_px: number; height_px: number };
// Decoded pixels. right_px and bottom_px are one past the last pixel.
export type PixelBox = {
  left_px: number;
  top_px: number;
  right_px: number;
  bottom_px: number;
};
// Page pixels.
export type GlyphHint = {
  region_id: string;
  glyph_size_px: number;
  is_vertical: boolean;
};
// Decoded pixels.
export type GlyphEstimate = { glyph_size_px: number; is_vertical: boolean };
export type PageAppearanceResult = {
  regions: TextRegion[];
  analyzed_region_count: number;
  skipped_region_count: number;
  timed_out_region_count: number;
  analysis_ms: number;
};
