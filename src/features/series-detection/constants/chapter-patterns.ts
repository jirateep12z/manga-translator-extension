export const URL_CHAPTER_SEGMENT_PATTERN =
  /(?:^|[-_.])(?:chapter|chap|ch|episode|ep)[-_.]?(\d+)(?:[-_.](\d+))?(?=$|[-_.])/i;
export const CHAPTER_MARKER_WORD_PATTERN = /^(?:chapter|chap|ch|episode|ep)$/i;
export const NUMERIC_SEGMENT_PATTERN = /^(\d+)(?:[-_.](\d+))?$/;
export const TITLE_CHAPTER_PATTERN =
  /\b(?:chapter|chap|ch|episode|ep)\.?\s*(\d+)(?:\.(\d+))?/i;
export const THAI_CHAPTER_PATTERN = /ตอนที่[-_\s]*(\d+)(?:\.(\d+))?/;
export const CJK_CHAPTER_PATTERN = /第\s*(\d+)(?:\.(\d+))?\s*[話话章回]/;
export const KOREAN_CHAPTER_PATTERN = /(\d+)(?:\.(\d+))?\s*화/;
export const VOLUME_MARKER_PATTERN = /\bvol(?:ume)?\.?\s*\d/i;
export const LOCALIZED_CHAPTER_PATTERNS: readonly RegExp[] = [
  THAI_CHAPTER_PATTERN,
  CJK_CHAPTER_PATTERN,
  KOREAN_CHAPTER_PATTERN
];
export const TITLE_CHAPTER_PATTERNS: readonly RegExp[] = [
  TITLE_CHAPTER_PATTERN,
  ...LOCALIZED_CHAPTER_PATTERNS
];
export const TITLE_CUT_PATTERNS: readonly RegExp[] = [
  ...TITLE_CHAPTER_PATTERNS,
  VOLUME_MARKER_PATTERN
];
