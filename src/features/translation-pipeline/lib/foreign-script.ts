import type { ReportedEntity } from '@/features/memory';
import type { TargetLanguage } from '@/features/settings';
import type { RegionTranslation } from '@/services/database';
import {
  SCRIPT_CORRECTION_HEADER,
  TARGET_LANGUAGE_NAMES
} from '../constants/prompts';
import type { ForeignScriptViolation } from '../types/pipeline';

// Translation models can slip letters of another language into a
// translation, as Han characters into Thai on MangaDex pages 32 and 37.
// Thai text keeps Latin names and acronyms such as "HP". Digits,
// punctuation, and combining marks are not letters, so they always pass, and
// so do letters of the Common script that all languages share, such as "µ".
const LETTER_PATTERN = /\p{L}/u;
const SHARED_LETTER_PATTERN = /\p{Script=Common}/u;
// A run of foreign letters keeps the vowel and tone marks written on them,
// so the correction quotes "สวัสดี", not its bare letters "สวด".
const MARK_PATTERN = /\p{M}/u;
const TARGET_LETTER_PATTERNS: Record<TargetLanguage, RegExp> = {
  th: /[\p{Script=Thai}\p{Script=Latin}]/u,
  en: /\p{Script=Latin}/u
};

/** Each distinct run of foreign letters in the text, in order. */
function FindForeignTextRuns(
  text: string,
  target_letter_pattern: RegExp
): string[] {
  const foreign_text_runs: string[] = [];
  let current_run = '';

  for (const character of text) {
    const is_foreign_letter =
      LETTER_PATTERN.test(character) &&
      !SHARED_LETTER_PATTERN.test(character) &&
      !target_letter_pattern.test(character);
    const is_mark_of_run = current_run !== '' && MARK_PATTERN.test(character);

    if (is_foreign_letter || is_mark_of_run) {
      current_run += character;
      continue;
    }

    if (current_run !== '') foreign_text_runs.push(current_run);
    current_run = '';
  }

  if (current_run !== '') foreign_text_runs.push(current_run);

  return [...new Set(foreign_text_runs)];
}

export function FindForeignScriptViolations(
  translations: RegionTranslation[],
  target_language: TargetLanguage
): ForeignScriptViolation[] {
  const target_letter_pattern = TARGET_LETTER_PATTERNS[target_language];

  return translations.flatMap(translation => {
    const foreign_text_runs = FindForeignTextRuns(
      translation.text,
      target_letter_pattern
    );

    return foreign_text_runs.length === 0
      ? []
      : [{ region_id: translation.region_id, foreign_text_runs }];
  });
}

/**
 * New names whose translation uses only the target language's scripts. A
 * saved name with a stray letter would force it into every later page.
 */
export function KeepTargetScriptEntities(
  entities: ReportedEntity[],
  target_language: TargetLanguage
): ReportedEntity[] {
  const target_letter_pattern = TARGET_LETTER_PATTERNS[target_language];

  return entities.filter(
    entity =>
      FindForeignTextRuns(entity.translation, target_letter_pattern).length ===
      0
  );
}

export function BuildScriptCorrectionText(
  violations: ForeignScriptViolation[],
  target_language: TargetLanguage
): string {
  const language_name = TARGET_LANGUAGE_NAMES[target_language];

  return [
    SCRIPT_CORRECTION_HEADER,
    ...violations.map(
      violation =>
        `- region ${violation.region_id}: rewrite ${violation.foreign_text_runs
          .map(foreign_text_run => `"${foreign_text_run}"`)
          .join(', ')} in ${language_name}`
    )
  ].join('\n');
}
