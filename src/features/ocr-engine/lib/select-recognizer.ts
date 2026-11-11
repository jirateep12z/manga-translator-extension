import {
  RECOGNIZER_HANGUL_PATTERN,
  RECOGNIZER_LETTER_PATTERN
} from '../constants/ocr-engine';
import type {
  DecodedText,
  OcrRecognizer,
  RecognitionLine
} from '../types/ocr-engine';

function ComputeBoxArea(line: RecognitionLine): number {
  return line.bbox_px.width_px * line.bbox_px.height_px;
}

// The pattern is global, so it is used only with String.prototype.match,
// which keeps no state between calls; `.test` would.
function CountLetters(text: string): number {
  return (text.match(RECOGNIZER_LETTER_PATTERN) ?? []).length;
}

function WeighSample(sample: readonly DecodedText[]): number {
  return sample.reduce(
    (sample_weight, decoded_text) =>
      sample_weight + decoded_text.score * CountLetters(decoded_text.text),
    0
  );
}

function HasHangulLetter(sample: readonly DecodedText[]): boolean {
  return sample.some(decoded_text =>
    RECOGNIZER_HANGUL_PATTERN.test(decoded_text.text)
  );
}

/**
 * Picks the lines that both recognizers read to choose one for the page
 * (spec 0002 §6.5): the largest boxes first, earlier lines first on ties.
 */
export function PickRecognizerSample(
  lines: readonly RecognitionLine[],
  sample_size: number
): RecognitionLine[] {
  return lines
    .toSorted(
      (left, right) =>
        ComputeBoxArea(right) - ComputeBoxArea(left) ||
        left.line_index - right.line_index
    )
    .slice(0, sample_size);
}

/**
 * Chooses the Korean recognizer only when its sample weighs more than the
 * general recognizer's (spec 0002 §6.5): each line weighs its score times its
 * letter count, so punctuation alone cannot outweigh letters. Both models read
 * Latin letters, so the Korean reading must also have a Hangul letter (§21).
 */
export function ChooseRecognizer(
  general_sample: readonly DecodedText[],
  korean_sample: readonly DecodedText[]
): OcrRecognizer {
  return WeighSample(korean_sample) > WeighSample(general_sample) &&
    HasHangulLetter(korean_sample)
    ? 'korean'
    : 'general';
}
