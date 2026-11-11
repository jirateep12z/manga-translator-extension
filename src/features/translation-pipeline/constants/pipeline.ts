export const TALL_IMAGE_RATIO = 2.0;
export const TILE_HEIGHT_RATIO = 1.5;
export const TILE_OVERLAP_RATIO = 0.1;
export const MAX_TILE_SIDE_PX = 1600;
export const JPEG_QUALITY = 0.9;
export const NORMALIZED_BOX_MAX = 1000;
// Box snapping decodes pages at most this wide and this large, so spreads and
// long strips stay cheap in the service worker.
export const SNAP_MAX_IMAGE_WIDTH_PX = 2000;
export const SNAP_MAX_IMAGE_PIXELS = 12_000_000;
export const DEDUP_IOU_THRESHOLD = 0.5;
export const IMAGE_READING_TEMPERATURE = 0;
export const TRANSLATION_TEMPERATURE = 0.3;
export const FINALIZATION_TEMPERATURE = 0.2;
export const OLLAMA_ORIGIN_RULE_ID = 1;
export const REFERER_RULE_ID_MIN = 1000;
export const REFERER_RULE_ID_MAX = 1999;
export const CAPTURE_MIN_INTERVAL_MS = 600;
export const IMAGE_FETCH_TIMEOUT_MS = 30_000;
// Image formats first, as an <img> request asks. Some image hosts answer a
// bare `*/*` with text instead of image bytes.
export const IMAGE_ACCEPT_HEADER =
  'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
export const CAPTURE_QUEUE_KEY = 'capture';
export const WARM_UP_PAGE_INDEX = -1;
