const PUNCTUATION_OR_SYMBOL_PATTERN = /[\p{P}\p{S}]+/gu;
const WHITESPACE_PATTERN = /\s+/gu;

export function NormalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(PUNCTUATION_OR_SYMBOL_PATTERN, ' ')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim();
}
