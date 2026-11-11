import type { ReportedEntity } from '@/features/memory';
import type { TargetLanguage } from '@/features/settings';

const THAI_LETTER_PATTERN = /\p{Script=Thai}/u;

/**
 * Amendment U2 rule A: a Thai translation without a single Thai letter
 * ("HEADON" for HEADON) is the source name left untranslated. Storing it
 * would force the untranslated name into every later page, so the entity is
 * kept without a translation, for the model or the user to fill later.
 */
export function ClearUntranslatedNames(
  entities: readonly ReportedEntity[],
  target_language: TargetLanguage
): ReportedEntity[] {
  if (target_language !== 'th') return [...entities];

  return entities.map(entity =>
    THAI_LETTER_PATTERN.test(entity.translation)
      ? entity
      : { ...entity, translation: '' }
  );
}
