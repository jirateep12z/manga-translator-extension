import type { OcrLine, OcrRecognizer } from '@/features/ocr-engine';
import type { SourceLanguage } from '@/services/database';
import {
  HAN_LETTER_PATTERN,
  HAN_MIN_SHARE,
  HANGUL_LETTER_PATTERN,
  HANGUL_MIN_SHARE,
  KANA_LETTER_PATTERN,
  KANA_MIN_SHARE,
  LATIN_LETTER_PATTERN,
  LATIN_MIN_SHARE
} from '../constants/ocr-reader';
import { ReadLetters } from './read-letters';

function ComputeShare(
  letters: readonly string[],
  letter_pattern: RegExp
): number {
  const matching_count = letters.filter(letter =>
    letter_pattern.test(letter)
  ).length;

  return matching_count / letters.length;
}

/**
 * Detects the page's source language from the scripts of the kept lines
 * (spec 0002 §7.5). The Korean recognizer's choice counts as Korean.
 */
export function DetectSourceLanguage(
  kept_lines: readonly OcrLine[],
  recognizer: OcrRecognizer
): SourceLanguage {
  const letters = kept_lines.flatMap(line => ReadLetters(line.text));

  if (letters.length === 0) return 'other';
  if (
    recognizer === 'korean' ||
    ComputeShare(letters, HANGUL_LETTER_PATTERN) >= HANGUL_MIN_SHARE
  ) {
    return 'ko';
  }

  if (ComputeShare(letters, KANA_LETTER_PATTERN) >= KANA_MIN_SHARE) return 'ja';
  if (ComputeShare(letters, HAN_LETTER_PATTERN) >= HAN_MIN_SHARE) return 'zh';
  if (ComputeShare(letters, LATIN_LETTER_PATTERN) >= LATIN_MIN_SHARE) {
    return 'en';
  }

  return 'other';
}
