import { LETTER_PATTERN } from '../constants/ocr-reader';

/**
 * Returns the letters of a text (spec 0002 §7.1 and §7.5). LETTER_PATTERN is
 * global, so it is used only with String.prototype.match, which does not keep
 * state between calls; `.test` would.
 */
export function ReadLetters(text: string): string[] {
  return text.match(LETTER_PATTERN) ?? [];
}
