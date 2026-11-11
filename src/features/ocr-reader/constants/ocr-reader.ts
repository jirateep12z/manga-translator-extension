// Starting values from spec 0002 §7. Changes from the parity review are
// recorded in docs/plans/execution-record.md.
export const SHORT_LINE_MAX_LETTERS = 3;
export const MIN_SHORT_LINE_SCORE = 0.8;
export const MIN_LINE_SCORE = 0.6;
export const FURIGANA_MAX_THICKNESS_RATIO = 0.6;
export const FURIGANA_INSIDE_TOLERANCE_RATIO = 1.5;
export const FURIGANA_OUTSIDE_TOLERANCE_RATIO = 0.5;
export const FURIGANA_MIN_OVERLAP_RATIO = 0.5;
export const VERTICAL_LINK_MAX_WIDTH_RATIO = 1.8;
export const VERTICAL_LINK_MAX_GAP_RATIO = 0.8;
export const VERTICAL_LINK_MIN_OVERLAP_RATIO = 0.3;
export const VERTICAL_LINK_MAX_TOP_OFFSET_RATIO = 1.0;
export const SAME_COLUMN_MIN_OVERLAP_RATIO = 0.5;
export const SAME_COLUMN_MAX_GAP_RATIO = 1.0;
export const HORIZONTAL_LINK_MAX_HEIGHT_RATIO = 1.6;
export const HORIZONTAL_LINK_MAX_GAP_RATIO = 0.95;
export const HORIZONTAL_LINK_MIN_OVERLAP_RATIO = 0.3;
export const HORIZONTAL_LINK_MAX_CENTER_OFFSET_RATIO = 0.35;
export const LINE_ORDER_MIN_OVERLAP_RATIO = 0.5;
export const READING_ROW_MIN_OVERLAP_RATIO = 0.5;
export const NESTED_GROUP_MIN_INSIDE_RATIO = 0.8;
export const AUTO_RTL_MIN_VERTICAL_SHARE = 0.5;
export const HANGUL_MIN_SHARE = 0.3;
export const KANA_MIN_SHARE = 0.05;
export const HAN_MIN_SHARE = 0.5;
export const LATIN_MIN_SHARE = 0.5;
export const LETTER_PATTERN = /\p{L}/gu;
export const KANA_LETTER_PATTERN =
  /^[\p{Script=Hiragana}\p{Script=Katakana}ー]$/u;
export const HANGUL_LETTER_PATTERN = /^\p{Script=Hangul}$/u;
export const HAN_LETTER_PATTERN = /^\p{Script=Han}$/u;
export const LATIN_LETTER_PATTERN = /^\p{Script=Latin}$/u;
