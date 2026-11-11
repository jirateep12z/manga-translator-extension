import type { BboxPx } from '@/services/database';
import type { Rect } from './geometry';

/** One gray value (0 black to 255 white) per pixel, row by row. */
export type GrayImage = {
  pixels: Uint8Array;
  width_px: number;
  height_px: number;
};

export type SnapRegionInput = { bbox_px: BboxPx; source_text: string };

export type TextBlock = {
  rect: Rect;
  glyph_count: number;
  /** Sum of the block's glyph box areas. */
  glyph_box_area_px: number;
};

/** Lettering found near a model box, with the space it may grow into. */
export type TextArea = {
  area_key: string;
  bounds: Rect;
  blocks: TextBlock[];
  glyph_count: number;
  glyph_height_px: number;
  /**
   * One label per pixel of `bounds`; WHITE_LABEL marks the bubble's paper.
   * Null for lettering without a closed bubble, which grows only over paper
   * that ink encloses within `bounds`.
   */
  pixel_labels: Uint8Array | null;
};
