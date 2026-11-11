import type { RgbColor } from '@/types/rgb-color';
import type { OverlayFont, OverlayTypography } from '../types/overlay';

export const MIN_OVERLAY_FONT_PX = 9;
export const MAX_OVERLAY_FONT_PX = 28;
export const MAX_VERTICAL_GROWTH_RATIO = 0.3;
export const MIN_REGION_SIZE_PX = 1;
export const ORIGINAL_CLASS_NAME =
  'pointer-events-auto absolute rounded-md border-2 border-dashed border-sky-500 bg-transparent focus-visible:outline-2 focus-visible:outline-sky-600';
export const ORIGINAL_REGION_LABEL =
  'Original text shown. Activate to show the translation.';

// Blended style (spec 0003 §8.9)
export const TEXT_FONT_CAP_RATIO_HORIZONTAL = 1.35;
export const TEXT_FONT_CAP_RATIO_VERTICAL = 1.1;
export const TEXT_FONT_CAP_MIN_PX = 12;
export const TEXT_FONT_CAP_MAX_PX = 34;
export const LABEL_FONT_RATIO = 0.45;
export const LABEL_FONT_MIN_PX = 16;
export const LABEL_FONT_MAX_PX = 26;
export const LABEL_MIN_WIDTH_EM = 7;
export const LABEL_GAP_PX = 2;
export const LABEL_HALO_RATIO = 0.1;
export const LABEL_HALO_MIN_PX = 1.5;
export const PATCH_FEATHER_RATIO = 0.25;
export const PATCH_FEATHER_MIN_PX = 2;
export const BLUR_RADIUS_RATIO = 0.5;
export const BLUR_RADIUS_MIN_PX = 3;
export const BLUR_FADE_RATIO = 0.35;
export const BLUR_FADE_MIN_PX = 4;
export const BLUR_TINT_ALPHA = 0.35;
export const TINT_FALLBACK_ALPHA = 0.8;
export const HALO_RATIO_TEXT = 0.12;
export const HALO_MIN_PX = 1.5;
export const MIN_TEXT_CONTRAST_RATIO = 4.5;
export const DARK_TEXT_COLOR: RgbColor = [20, 20, 20];
export const LIGHT_TEXT_COLOR: RgbColor = [250, 250, 250];
export const WHITE_HALO_COLOR: RgbColor = [255, 255, 255];
export const BLACK_HALO_COLOR: RgbColor = [17, 17, 17];
export const DARK_TEXT_MAX_LUMA = 128; // a color is dark when its luma is below this
export const HALO_BACKGROUND_MIN_LUMA = 170;
export const HALO_BACKGROUND_MAX_LUMA = 85;
export const ITIM_STROKE_EM = 0.035;
export const ITIM_STROKE_MIN_FONT_PX = 12;
export const BLENDED_LINE_HEIGHT = 1.2;
export const FONT_LOAD_TIMEOUT_MS = 3000;
export const FONT_LOAD_SAMPLE_TEXT = 'กA';
export const FONT_LOAD_DESCRIPTOR = '400 16px Itim';
export const OVERLAY_TYPOGRAPHY: Readonly<
  Record<OverlayFont, OverlayTypography>
> = {
  itim: {
    font_family:
      "'Itim', 'Noto Sans Thai Variable', 'Inter Variable', sans-serif",
    font_weight: 400
  },
  fallback: {
    font_family: "'Inter Variable', 'Noto Sans Thai Variable', sans-serif",
    font_weight: 600
  }
};
