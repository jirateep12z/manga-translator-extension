import {
  IsRegionAppearance,
  REGION_APPEARANCE_VERSION
} from '@/features/region-appearance';
import type { TargetLanguage } from '@/features/settings';
import type { PageReadingRecord, RegionTranslation } from '@/services/database';
import type { PageOutcome, PageTranslationResult } from '../types/pipeline';

export function DeriveCachedOutcome(
  reading: PageReadingRecord,
  target_language: TargetLanguage
): PageOutcome {
  if (reading.regions.length === 0) return 'no_text';
  if (reading.source_language === target_language) {
    return 'already_in_target_language';
  }

  return 'translated';
}

export function BuildPageResult(input: {
  page_index: number;
  reading: PageReadingRecord;
  target_language: TargetLanguage;
  translations: RegionTranslation[];
  outcome: PageOutcome;
}): PageTranslationResult {
  const text_by_region = new Map(
    input.translations.map(translation => [
      translation.region_id,
      translation.text
    ])
  );
  // Stage 2's flag adds sound effects that the OCR reader cannot classify;
  // it never overrides the AI reader's own sfx (spec 0003 §21).
  const sound_effect_region_ids = new Set(
    input.translations
      .filter(translation => translation.is_sound_effect === true)
      .map(translation => translation.region_id)
  );
  // Appearance of another analysis version never reaches the content script
  // (spec 0003 §7.1 and §7.5).
  const has_current_appearance =
    input.reading.appearance_version === REGION_APPEARANCE_VERSION;

  return {
    page_index: input.page_index,
    outcome: input.outcome,
    image_width_px: input.reading.width_px,
    image_height_px: input.reading.height_px,
    source_language: input.reading.source_language,
    target_language: input.target_language,
    regions: input.reading.regions.map(region => ({
      region_id: region.region_id,
      bbox_px: region.bbox_px,
      kind:
        region.kind === 'sfx' || sound_effect_region_ids.has(region.region_id)
          ? 'sfx'
          : region.kind,
      source_text: region.source_text,
      translated_text: text_by_region.get(region.region_id) ?? null,
      appearance:
        has_current_appearance && IsRegionAppearance(region.appearance)
          ? region.appearance
          : null
    }))
  };
}
