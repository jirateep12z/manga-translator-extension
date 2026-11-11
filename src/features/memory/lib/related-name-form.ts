import { NormalizeText } from '@/lib/normalize-text';

const MIN_FORM_CODE_POINTS = 2;

// Scripts that separate words with spaces, where a name is one or more whole
// words. Other scripts (Hangul names, Thai, Chinese, Japanese) write a name
// without spaces, so a shorter form can sit inside a word.
const WORD_SPACED_SCRIPT_PATTERN =
  /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u;

function SortWords(normalized_text: string): string {
  return normalized_text.split(' ').sort().join(' ');
}

function ContainsWords(
  normalized_text: string,
  normalized_part: string
): boolean {
  return ` ${normalized_text} `.includes(` ${normalized_part} `);
}

function Contains(normalized_text: string, normalized_part: string): boolean {
  const is_word_spaced =
    WORD_SPACED_SCRIPT_PATTERN.test(normalized_text) ||
    WORD_SPACED_SCRIPT_PATTERN.test(normalized_part);

  return is_word_spaced
    ? ContainsWords(normalized_text, normalized_part)
    : normalized_text.includes(normalized_part);
}

/**
 * Whether a form the AI reports can be another way of writing one of these
 * names: one contains the other ("Lady Yuri" and "Yuri", "진우" and "성진우"),
 * or both have the same words in another order. In a script that separates
 * words with spaces, containment is by whole words, so "Bam" and "Bambi" are
 * different names. A title alone ("Princess") or another person's name is
 * not related, so it never becomes an alias.
 */
export function IsRelatedNameForm(
  names: readonly string[],
  form: string
): boolean {
  const normalized_form = NormalizeText(form);

  if (Array.from(normalized_form).length < MIN_FORM_CODE_POINTS) return false;

  return names
    .map(NormalizeText)
    .filter(normalized_name => normalized_name !== '')
    .some(
      normalized_name =>
        Contains(normalized_name, normalized_form) ||
        Contains(normalized_form, normalized_name) ||
        SortWords(normalized_name) === SortWords(normalized_form)
    );
}
