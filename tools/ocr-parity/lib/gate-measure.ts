import type { OcrLine, OcrRecognizer } from '@/features/ocr-engine';
import { FilterOcrLines } from '@/features/ocr-reader';
import { ToAxisAlignedBox } from './match-reference-lines';
import type { ReferenceLine } from './parity-groups';
import {
  MIN_REFERENCE_SCORE,
  REFERENCE_VERTICAL_MIN_ASPECT_RATIO
} from './parity-groups';

// Not global, so `.test` keeps no state between calls.
const HANGUL_LETTER_PATTERN = /\p{Script=Hangul}/u;

function ToReferenceOcrLine(line: ReferenceLine): OcrLine {
  const bbox_px = ToAxisAlignedBox(line.poly);

  return {
    bbox_px,
    text: line.text,
    score: line.score,
    is_vertical:
      bbox_px.height_px / bbox_px.width_px >=
      REFERENCE_VERTICAL_MIN_ASPECT_RATIO
  };
}

/**
 * Selects the reference lines that the gate measure counts (spec 0002 §15.2,
 * as amended): the lines that FilterOcrLines keeps when it filters all of the
 * tile's reference lines together, with a score of at least
 * MIN_REFERENCE_SCORE. They stay in input order.
 */
export function SelectCountedReferenceLines(
  lines: readonly ReferenceLine[]
): ReferenceLine[] {
  // FilterOcrLines returns the line objects it keeps, so identity maps them
  // back to their reference lines.
  const reference_by_ocr_line = new Map<OcrLine, ReferenceLine>(
    lines.map(line => [ToReferenceOcrLine(line), line])
  );
  const kept_references = new Set(
    FilterOcrLines([...reference_by_ocr_line.keys()]).map(ocr_line =>
      reference_by_ocr_line.get(ocr_line)
    )
  );

  return lines.filter(
    line => kept_references.has(line) && line.score >= MIN_REFERENCE_SCORE
  );
}

export function HasHangulLetter(text: string): boolean {
  return HANGUL_LETTER_PATTERN.test(text);
}

/**
 * Whether the gate measure checks a tile's recognizer (spec 0002 §15.2, as
 * amended): every tile of a general group, and a Korean tile only when one of
 * its counted lines has a Hangul letter.
 */
export function IsRecognizerChecked(
  expected_recognizer: OcrRecognizer,
  counted_lines: readonly ReferenceLine[]
): boolean {
  return (
    expected_recognizer === 'general' ||
    counted_lines.some(line => HasHangulLetter(line.text))
  );
}
