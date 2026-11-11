export const MIN_MANGA_IMAGE_WIDTH_PX = 300;
export const MIN_MANGA_IMAGE_HEIGHT_PX = 200;
export const MIN_RELATIVE_RENDERED_WIDTH = 0.4;
export const MIN_MANGA_IMAGES_FOR_PANEL = 3;
export const RESCAN_DEBOUNCE_MS = 500;
// Pages that mutate nonstop (ads, timers) would otherwise never settle.
export const RESCAN_MAX_WAIT_MS = 1000;
export const PLACEHOLDER_DATA_URL_MAX_LENGTH = 256;
// Page ids are remembered by image source for this many sources, so a long
// single-page-app session does not grow the map without bound.
export const MAX_TRACKED_PAGE_SOURCES = 1000;
export const LAZY_SOURCE_ATTRIBUTES = [
  'data-src',
  'data-original',
  'data-lazy-src'
] as const;
export const EXCLUDED_ANCESTOR_SELECTOR = 'header, nav, footer, aside';
// Readers that insert page images only near the viewport are scrolled
// through once before a chapter run, so every page exists in the DOM.
// Each stop overlaps the previous one so no page slot is skipped.
export const PRELOAD_SCROLL_STEP_RATIO = 0.8;
// Two frames let the reader's IntersectionObserver fire and render.
export const PRELOAD_FRAMES_PER_STOP = 2;
export const PRELOAD_MAX_SCROLL_STOPS = 300;
export const SCROLLABLE_OVERFLOW_VALUES: ReadonlySet<string> = new Set([
  'auto',
  'scroll',
  'overlay'
]);
