import type { RegionTranslation } from '@/services/database';
import type { TranslatedRegion } from '../types/pipeline';

/** The stored form of a page's translations: names_used is only for checks. */
export function ToStoredTranslations(
  translations: readonly TranslatedRegion[]
): RegionTranslation[] {
  return translations.map(
    ({ region_id, text, speaker_source_name, is_sound_effect }) => ({
      region_id,
      text,
      ...(speaker_source_name === undefined ? {} : { speaker_source_name }),
      ...(is_sound_effect === true ? { is_sound_effect } : {})
    })
  );
}
