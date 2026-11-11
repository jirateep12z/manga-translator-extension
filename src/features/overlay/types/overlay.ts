import type { RenderedRegion } from '@/features/chapter-translation';
import type { RgbColor } from '@/types/rgb-color';

export type DocumentRect = {
  left_px: number;
  top_px: number;
  width_px: number;
  height_px: number;
};

export type PageBadge = {
  kind: 'translating' | 'failed' | 'no-text' | 'already-in-target' | 'warnings';
  label: string;
};

export type FittedText = {
  font_size_px: number;
  box_height_px: number;
  is_overflowing: boolean;
};
export type BlendedFit = FittedText & { is_word_split: boolean };

export type PixelSize = { width_px: number; height_px: number };
export type OverlayFont = 'itim' | 'fallback';
export type OverlayFontStatus = 'loading' | OverlayFont;
export type OverlayFontLoad = {
  font: OverlayFont;
  load_ms: number;
  outcome: 'loaded' | 'failed' | 'timed_out';
};
export type OverlayTypography = { font_family: string; font_weight: number };
// Rects in plans are relative to the page's content rect, in CSS pixels.
// The insets of a `clip-path: inset()` that keeps a patch, with its glow or
// fade, inside the content rect; a negative inset clips nothing on that side
// (spec 0003 §8.5, "Clipping").
export type ClipInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};
export type PatchPlan =
  | {
      kind: 'solid' | 'tint';
      rect: DocumentRect;
      color: RgbColor;
      alpha: number;
      radius_px: number;
      feather_px: number;
      clip_insets_px: ClipInsets;
    }
  | {
      kind: 'blur';
      rect: DocumentRect;
      color: RgbColor;
      alpha: number;
      blur_px: number;
      fade_px: number;
      clip_insets_px: ClipInsets;
    };
export type HaloPlan = { color: RgbColor; width_px: number };
export type BlendedTextPlan = {
  font: OverlayFont;
  rect: DocumentRect;
  font_size_px: number;
  is_overflowing: boolean;
  color: RgbColor;
  halo: HaloPlan | null;
  has_outline: boolean;
};
export type BlendedRegionPlan = {
  kind: 'redrawn' | 'label';
  patch: PatchPlan | null;
  text: BlendedTextPlan;
};
// null while the font loads (spec 0003 §8.3).
export type BlendedStyle = {
  font: OverlayFont;
  is_blur_supported: boolean;
  MeasureText: (text: string, width_px: number, font_size_px: number) => number;
  MeasureWidestWord: (text: string, font_size_px: number) => number;
};
export type DrawnRegion = {
  region: RenderedRegion;
  region_rect: DocumentRect;
  plan: BlendedRegionPlan | null; // null: today's style
};
export type OverlayPageCounts = {
  region_count: number;
  blended_count: number;
  current_style_count: number;
  unchanged_count: number;
  label_count: number;
  blur_count: number;
  tint_count: number;
  overflow_count: number;
};
export type OverlayPagePlan = {
  drawn_regions: DrawnRegion[];
  counts: OverlayPageCounts;
  plan_ms: number;
};
