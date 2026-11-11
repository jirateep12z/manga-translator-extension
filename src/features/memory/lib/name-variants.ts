import { MAX_NAME_VARIANTS } from '../constants/memory';

const MIN_NAME_TEXT_CODE_POINTS = 2;

// Thai words a speaker uses for "I". A name fix never replaces one, because
// they are also ordinary words (plan 0016, Review Focus 1).
export const THAI_SELF_PRONOUNS = [
  'ผม',
  'กระผม',
  'ฉัน',
  'ชั้น',
  'ดิฉัน',
  'ข้า',
  'ข้าพเจ้า',
  'กู',
  'เรา',
  'หนู'
] as const;

const THAI_SELF_PRONOUN_SET: ReadonlySet<string> = new Set(THAI_SELF_PRONOUNS);

// Spec 0004 §6.3 conditions 2–4, plus the self-pronoun guard.
export function IsReplaceableNameText(input: {
  text: string;
  translation: string;
  other_translations: readonly string[];
}): boolean {
  const { text, translation } = input;

  return (
    Array.from(text).length >= MIN_NAME_TEXT_CODE_POINTS &&
    !text.includes(translation) &&
    !translation.includes(text) &&
    !input.other_translations.includes(text) &&
    !THAI_SELF_PRONOUN_SET.has(text)
  );
}

export function AddNameVariant(
  variants: readonly string[],
  text: string
): string[] {
  if (variants.includes(text) || variants.length >= MAX_NAME_VARIANTS) {
    return [...variants];
  }

  return [...variants, text];
}

// Spec 0004 §8.4: the old text becomes a wrong spelling of the new one.
export function UpdateVariantsForNewTranslation(input: {
  variants: readonly string[];
  old_text: string;
  new_text: string;
  other_translations: readonly string[];
}): string[] {
  const kept_variants = input.variants.filter(
    variant => variant !== input.new_text
  );
  const is_old_text_kept =
    input.old_text !== '' &&
    IsReplaceableNameText({
      text: input.old_text,
      translation: input.new_text,
      other_translations: input.other_translations
    });

  return is_old_text_kept
    ? AddNameVariant(kept_variants, input.old_text)
    : kept_variants;
}
