import { NormalizeText } from '@/lib/normalize-text';

const WHITESPACE_PATTERN = /\s+/gu;

// The normalized text with no whitespace, so that case, width, spacing, and
// punctuation do not matter.
function Compact(text: string): string {
  return NormalizeText(text).replace(WHITESPACE_PATTERN, '');
}

// True when the translation only repeats the source text, as for a logo or a
// name (spec 0003 §8.2). A missing translation is never unchanged.
export function IsUnchangedTranslation(
  source_text: string,
  translated_text: string | null
): boolean {
  return (
    translated_text !== null &&
    Compact(source_text) === Compact(translated_text)
  );
}
