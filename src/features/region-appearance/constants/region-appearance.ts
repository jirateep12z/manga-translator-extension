import type { RgbColor } from '@/types/rgb-color';

// Spec 0003 §6.10. A change during QA is recorded in
// docs/plans/execution-record.md, with the pages that justify it.

export const REGION_APPEARANCE_VERSION = 1;

// Color distances (Chebyshev).
export const PAPER_MAX_DISTANCE = 40;
export const FLAT_MAX_DISTANCE = 28;
export const INK_MIN_DISTANCE = 90;
export const INK_MIN_CANDIDATES = 20;
export const MODE_NEAR_MAX_DISTANCE = 32;
export const COLOR_BIN_BITS = 4;

// Backdrop flatness.
export const FLAT_RING_MIN_FRACTION = 0.8;
export const FLAT_RING_WITH_INTERIOR_MIN_FRACTION = 0.35;
export const FLAT_INTERIOR_MIN_FRACTION = 0.85;

// Pads and margins, as a share of the glyph size, with a minimum in pixels.
export const RING_INNER_PAD_RATIO = 0.12;
export const RING_INNER_PAD_MIN_PX = 1;
export const RING_WIDTH_RATIO = 0.3;
export const RING_WIDTH_MIN_PX = 3;
export const COVER_PAD_RATIO = 0.18;
export const COVER_PAD_MIN_PX = 2;
export const TEXT_MARGIN_RATIO = 0.2;
export const TEXT_MARGIN_MIN_PX = 1;

// Frame search window.
export const SEARCH_REACH_RATIO = 0.03;
export const REFERENCE_HEIGHT_TO_WIDTH_RATIO = 1.5;
export const MAX_SEARCH_WINDOW_PIXELS = 4_000_000;

// Search limit of an open frame.
export const OPEN_LIMIT_WIDTH_RATIO = 1.8;
export const OPEN_LIMIT_WIDTH_GLYPHS = 5;
export const OPEN_LIMIT_VERTICAL_HEIGHT_RATIO = 1.1;
export const OPEN_LIMIT_HEIGHT_RATIO = 1.5;
export const OPEN_LIMIT_HEIGHT_GLYPHS = 3;

// Candidate boxes.
export const TEXT_BOX_ASPECT_RATIOS: readonly number[] = [
  0.55, 0.75, 1, 1.3, 1.7, 2.2, 3
];
export const MAX_TEXT_BOX_CANDIDATES = 8;
export const VERTICAL_NARROW_RATIO = 0.7;
export const VERTICAL_WIDEN_RATIO = 0.85;

// Lettering.
export const DISPLAY_GLYPH_RATIO = 2.5;
export const DISPLAY_LONE_GLYPH_WIDTH_RATIO = 0.12;
export const DISPLAY_MAX_CHARACTERS = 6;
export const DISPLAY_IGNORED_CHARACTERS = '!！?？…。、,.~〜ー—-・';
export const DISPLAY_LARGE_AREA_RATIO = 0.06;
export const DISPLAY_LARGE_HEIGHT_RATIO = 0.25;

// Glyph size, in decoded pixels, and the page budget.
export const GLYPH_MIN_PX = 4;
export const GLYPH_RUN_MIN_PX = 2;
export const MAX_PAGE_ANALYSIS_MS = 2000;

// Sampling steps, chosen from the sampled area.
export const INTERIOR_STEP_3_ABOVE_AREA_PX = 120_000;
export const INTERIOR_STEP_2_ABOVE_AREA_PX = 30_000;
export const RING_STEP_3_ABOVE_AREA_PX = 200_000;
export const RING_STEP_2_ABOVE_AREA_PX = 50_000;
export const SEED_STEP = 2;
export const CENTROID_STEP = 3;

// Default ink. The background is light when its luma exceeds the minimum.
export const DEFAULT_DARK_INK: RgbColor = [20, 20, 20];
export const DEFAULT_LIGHT_INK: RgbColor = [245, 245, 245];
export const LIGHT_BACKGROUND_MIN_LUMA = 128;
