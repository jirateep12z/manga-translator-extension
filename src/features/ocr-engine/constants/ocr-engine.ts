import type { PixelNormalization } from '../types/ocr-engine';

export const OCR_MODEL_NAMES = {
  detection: 'PP-OCRv6_small_det',
  general: 'PP-OCRv6_small_rec',
  korean: 'korean_PP-OCRv5_mobile_rec'
} as const;
export const OCR_MODELS_ASSET_DIR = 'ocr-models';
export const ORT_WASM_ASSET_PATH = 'assets/ort-wasm-simd-threaded.jsep.wasm';
// ONNX Runtime log severity (0 verbose … 4 fatal). Sessions default to 2,
// whose model-loading warnings fill the extension's error list.
export const ORT_ERROR_LOG_SEVERITY = 3;
export const TALL_PAGE_RATIO = 2.0;
export const DETECTION_TILE_HEIGHT_RATIO = 1.5;
export const DETECTION_TILE_OVERLAP_RATIO = 0.1;
// Suspect text is detected again on crops enlarged DETECTION_UPSCALE times, so
// tightly spaced lines separate (spec 0002 Section 24).
export const DETECTION_UPSCALE = 2;
// A page has small lettering when it has at least
// SMALL_LETTERING_MIN_LINE_COUNT first-pass lines and this quantile of their
// thicknesses is below SMALL_LETTERING_MAX_THICKNESS_PX (spec 0002 Section 23).
export const LETTERING_THICKNESS_QUANTILE = 0.5;
export const SMALL_LETTERING_MAX_THICKNESS_PX = 27;
export const SMALL_LETTERING_MIN_LINE_COUNT = 3;
// The second pass detects again only around suspect text: thin lines, lines
// thick enough to be two thin lines fused, and components that the box score
// drops (spec 0002 Section 24).
export const FURIGANA_MIN_THICKNESS_RATIO = 1.6;
export const FUSED_LINE_MIN_THICKNESS_RATIO = 1.8;
export const SUSPECT_LINE_MAX_THICKNESS_RATIO = 3;
export const DROPPED_COMPONENT_MIN_MAP_PIXEL_COUNT = 20;
export const DROPPED_COMPONENT_MIN_BOX_SCORE = 0.3;
export const SUSPECT_CROP_MARGIN_RATIO = 3;
// A first-pass line gives way only to two crop lines side by side across it,
// each at least half its length (spec 0002 Section 24).
export const STACKED_LINE_MAX_OVERLAP_RATIO = 0.5;
export const FUSED_PART_MIN_LENGTH_RATIO = 0.5;
export const DETECTION_MAX_SIDE_PX = 1440;
export const DETECTION_SIDE_STEP_PX = 32;
export const DETECTION_MIN_SIDE_PX = 3;
// A component thicker than this share of the map's shorter side is not a text
// line (spec 0002 §6.3, as amended by Section 23).
export const DETECTION_MAX_LINE_THICKNESS_RATIO = 0.5;
export const TILE_MERGE_MIN_OVERLAP_RATIO = 0.6;
export const MAX_OCR_IMAGE_PIXELS = 40_000_000;
export const VERTICAL_LINE_MIN_ASPECT_RATIO = 1.5;
export const RECOGNITION_BATCH_SIZE = 6;
export const RECOGNIZER_SAMPLE_LINE_COUNT = 12;
// The letters of spec 0002 §7.1, which weigh the recognizer choice (§6.5).
export const RECOGNIZER_LETTER_PATTERN = /\p{L}/gu;
// Hangul letters, which only the Korean recognizer reads (spec 0002 §6.5 and
// §21). Not global, so `.test` keeps no state between calls.
export const RECOGNIZER_HANGUL_PATTERN = /\p{Script=Hangul}/u;
export const RECOGNITION_NORMALIZATION: PixelNormalization = {
  scale: 1 / 255,
  mean: [0.5, 0.5, 0.5],
  std: [0.5, 0.5, 0.5]
};
export const WARM_UP_IMAGE_SIDE_PX = 64;
export const WARM_UP_CROP_SIDE_PX = 48;
export const MODELS_LOAD_FAILED_MESSAGE = 'The OCR models could not be loaded.';
export const WEBGPU_UNAVAILABLE_MESSAGE = 'WebGPU is not available.';
export const IMAGE_DECODE_FAILED_MESSAGE = 'The image could not be decoded.';
export const IMAGE_TOO_LARGE_MESSAGE = 'The image is too large to read.';
export const PAGE_READ_FAILED_MESSAGE = 'The page could not be read.';
export const CLASS_COUNT_MISMATCH_MESSAGE =
  'The recognition model does not match its character list.';
