import type { OcrLine } from '@/features/ocr-engine';
import type { BboxPx } from '@/services/database';
import {
  FURIGANA_INSIDE_TOLERANCE_RATIO,
  FURIGANA_MAX_THICKNESS_RATIO,
  FURIGANA_MIN_OVERLAP_RATIO,
  FURIGANA_OUTSIDE_TOLERANCE_RATIO,
  KANA_LETTER_PATTERN,
  MIN_LINE_SCORE,
  MIN_SHORT_LINE_SCORE,
  SHORT_LINE_MAX_LETTERS
} from '../constants/ocr-reader';
import {
  ComputeHorizontalOverlapPx,
  ComputeVerticalOverlapPx,
  ReadBoxBottom,
  ReadBoxRight
} from './box-geometry';
import { ReadLetters } from './read-letters';

function IsConfidentLine(line: OcrLine): boolean {
  const letter_count = ReadLetters(line.text).length;

  if (letter_count === 0) return false;

  const min_score =
    letter_count <= SHORT_LINE_MAX_LETTERS
      ? MIN_SHORT_LINE_SCORE
      : MIN_LINE_SCORE;

  return line.score >= min_score;
}

function IsKanaOnly(line: OcrLine): boolean {
  return ReadLetters(line.text).every(letter =>
    KANA_LETTER_PATTERN.test(letter)
  );
}

// Furigana sits just right of a vertical main line. Engine boxes are padded,
// so its box may start well inside the main line's box (spec 0002 §21).
function IsBesideVerticalLine(candidate: BboxPx, main: BboxPx): boolean {
  const main_right = ReadBoxRight(main);

  return (
    candidate.width_px <= FURIGANA_MAX_THICKNESS_RATIO * main.width_px &&
    main_right - candidate.width_px * FURIGANA_INSIDE_TOLERANCE_RATIO <=
      candidate.x_px &&
    candidate.x_px <=
      main_right + main.width_px * FURIGANA_OUTSIDE_TOLERANCE_RATIO &&
    ComputeVerticalOverlapPx(candidate, main) >=
      FURIGANA_MIN_OVERLAP_RATIO * candidate.height_px
  );
}

// Furigana sits just above a horizontal main line.
function IsAboveHorizontalLine(candidate: BboxPx, main: BboxPx): boolean {
  const candidate_bottom = ReadBoxBottom(candidate);

  return (
    candidate.height_px <= FURIGANA_MAX_THICKNESS_RATIO * main.height_px &&
    main.y_px - main.height_px * FURIGANA_OUTSIDE_TOLERANCE_RATIO <=
      candidate_bottom &&
    candidate_bottom <=
      main.y_px + candidate.height_px * FURIGANA_INSIDE_TOLERANCE_RATIO &&
    ComputeHorizontalOverlapPx(candidate, main) >=
      FURIGANA_MIN_OVERLAP_RATIO * candidate.width_px
  );
}

function IsFurigana(
  lines: readonly OcrLine[],
  candidate_index: number
): boolean {
  const candidate = lines[candidate_index];

  if (!IsKanaOnly(candidate)) return false;

  return lines.some(
    (main, main_index) =>
      main_index !== candidate_index &&
      (main.is_vertical
        ? IsBesideVerticalLine(candidate.bbox_px, main.bbox_px)
        : IsAboveHorizontalLine(candidate.bbox_px, main.bbox_px))
  );
}

/**
 * Drops OCR lines that are unlikely to be dialogue (spec 0002 §7.1): lines
 * without letters, low-score lines (short lines need a higher score), and
 * kana-only furigana beside a main line. Kept lines stay in input order.
 */
export function FilterOcrLines(lines: readonly OcrLine[]): OcrLine[] {
  const confident_lines = lines.filter(IsConfidentLine);

  return confident_lines.filter(
    (_, line_index) => !IsFurigana(confident_lines, line_index)
  );
}
