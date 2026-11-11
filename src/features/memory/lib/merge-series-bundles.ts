import { NormalizeText } from '@/lib/normalize-text';
import type {
  AddressTerm,
  ChapterRecord,
  EntityRecord,
  EntityTranslation,
  PageNote,
  SeriesRecord,
  SiteBindingRecord,
  SpeechProfile
} from '@/services/database';
import type { TargetLanguage } from '@/types/target-language';
import {
  MAX_ADDRESS_TERMS,
  MAX_NAME_VARIANTS,
  MAX_SOURCE_URLS_PER_CHAPTER
} from '../constants/memory';
import type { SeriesBundle, SeriesMergeResult } from '../types/memory';
import { UpdateVariantsForNewTranslation } from './name-variants';

const MERGE_TARGET_LANGUAGES: TargetLanguage[] = ['th', 'en'];

function DeduplicateByNormalizedText(
  values: string[],
  excluded_normalized_values: string[] = []
): string[] {
  const seen_values = new Set(excluded_normalized_values);
  const unique_values: string[] = [];

  for (const value of values) {
    const normalized_value = NormalizeText(value);

    if (seen_values.has(normalized_value)) continue;
    seen_values.add(normalized_value);
    unique_values.push(value);
  }

  return unique_values;
}

function PickLonger(target_text: string, source_text: string): string {
  return source_text.length > target_text.length ? source_text : target_text;
}

function PickEarlier(left_iso: string, right_iso: string): string {
  return left_iso <= right_iso ? left_iso : right_iso;
}

function PickLater(left_iso: string, right_iso: string): string {
  return left_iso >= right_iso ? left_iso : right_iso;
}

function PickLaterNullable(
  left_iso: string | null,
  right_iso: string | null
): string | null {
  if (left_iso === null) return right_iso;
  if (right_iso === null) return left_iso;

  return PickLater(left_iso, right_iso);
}

function MergeSeriesRecord(
  target: SeriesRecord,
  source: SeriesRecord,
  now_iso: string
): { series: SeriesRecord; added_alias_count: number } {
  const aliases = DeduplicateByNormalizedText([
    ...target.aliases,
    ...source.aliases,
    source.canonical_title
  ]);

  return {
    series: {
      ...target,
      aliases,
      normalized_aliases: aliases.map(NormalizeText),
      synopsis_en: PickLonger(target.synopsis_en, source.synopsis_en),
      updated_at: now_iso
    },
    added_alias_count: aliases.length - target.aliases.length
  };
}

function MergeBindings(
  target_bindings: SiteBindingRecord[],
  source_bindings: SiteBindingRecord[],
  target_series_id: string
): { site_bindings: SiteBindingRecord[]; moved_binding_count: number } {
  const moved_bindings = source_bindings
    .filter(
      source_binding =>
        !target_bindings.some(
          target_binding =>
            target_binding.hostname === source_binding.hostname &&
            target_binding.series_path_pattern ===
              source_binding.series_path_pattern
        )
    )
    .map(source_binding => ({
      ...source_binding,
      series_id: target_series_id
    }));

  return {
    site_bindings: [...target_bindings, ...moved_bindings],
    moved_binding_count: moved_bindings.length
  };
}

function MergeChapterNotes(
  target: ChapterRecord,
  source: ChapterRecord
): Pick<ChapterRecord, 'page_notes' | 'notes_hostname' | 'notes_updated_at'> {
  const is_same_hostname =
    target.notes_hostname === null ||
    source.notes_hostname === null ||
    target.notes_hostname === source.notes_hostname;

  if (is_same_hostname) {
    const target_page_indexes = new Set(
      target.page_notes.map(page_note => page_note.page_index)
    );
    const page_notes: PageNote[] = [
      ...target.page_notes,
      ...source.page_notes.filter(
        page_note => !target_page_indexes.has(page_note.page_index)
      )
    ].sort((left, right) => left.page_index - right.page_index);

    return {
      page_notes,
      notes_hostname: target.notes_hostname ?? source.notes_hostname,
      notes_updated_at: PickLaterNullable(
        target.notes_updated_at,
        source.notes_updated_at
      )
    };
  }

  const is_source_newer =
    (source.notes_updated_at ?? '') > (target.notes_updated_at ?? '');
  const newer_chapter = is_source_newer ? source : target;

  return {
    page_notes: newer_chapter.page_notes,
    notes_hostname: newer_chapter.notes_hostname,
    notes_updated_at: newer_chapter.notes_updated_at
  };
}

function MergeChapter(
  target: ChapterRecord,
  source: ChapterRecord,
  now_iso: string
): ChapterRecord {
  const summary_chapter =
    source.summary_en.length > target.summary_en.length ? source : target;
  const source_urls = [
    ...new Set([...target.source_urls, ...source.source_urls])
  ].slice(-MAX_SOURCE_URLS_PER_CHAPTER);

  return {
    ...target,
    ...MergeChapterNotes(target, source),
    summary_en: summary_chapter.summary_en,
    summarized_at: summary_chapter.summarized_at,
    status: summary_chapter.status,
    source_urls,
    created_at: PickEarlier(target.created_at, source.created_at),
    updated_at: now_iso
  };
}

function MergeChapters(
  target_chapters: ChapterRecord[],
  source_chapters: ChapterRecord[],
  target_series_id: string,
  now_iso: string
): { chapters: ChapterRecord[]; merged_chapter_count: number } {
  const chapters = [...target_chapters];
  let merged_chapter_count = 0;

  for (const source_chapter of source_chapters) {
    const match_index = chapters.findIndex(
      chapter => chapter.chapter_number === source_chapter.chapter_number
    );

    if (match_index === -1) {
      chapters.push({ ...source_chapter, series_id: target_series_id });
      continue;
    }

    chapters[match_index] = MergeChapter(
      chapters[match_index],
      source_chapter,
      now_iso
    );
    merged_chapter_count++;
  }

  return { chapters, merged_chapter_count };
}

type ControlledValue = Pick<EntityTranslation, 'origin' | 'is_locked'>;

function IsUserControlled(value: ControlledValue | null | undefined): boolean {
  return (
    value !== undefined &&
    value !== null &&
    (value.origin === 'user' || value.is_locked)
  );
}

// Spec 0004 §8.2: a user or locked value beats an AI one; otherwise the
// target's value stays, and a missing target value is filled.
function PickControlledValue<T extends ControlledValue>(
  target_value: T | null | undefined,
  source_value: T | null | undefined
): T | null {
  if (target_value === null || target_value === undefined) {
    return source_value ?? null;
  }

  return IsUserControlled(source_value) && !IsUserControlled(target_value)
    ? (source_value as T)
    : target_value;
}

function MergeAddressTerms(
  target_terms: readonly AddressTerm[],
  source_terms: readonly AddressTerm[]
): AddressTerm[] {
  const FindSourceTerm = (listener_source_name: string) =>
    source_terms.find(
      source_term =>
        NormalizeText(source_term.listener_source_name) ===
        NormalizeText(listener_source_name)
    );
  const merged_terms = target_terms.map(
    target_term =>
      PickControlledValue(
        target_term,
        FindSourceTerm(target_term.listener_source_name)
      ) ?? target_term
  );
  const target_listeners = new Set(
    target_terms.map(target_term =>
      NormalizeText(target_term.listener_source_name)
    )
  );
  const source_only_terms = source_terms.filter(
    source_term =>
      !target_listeners.has(NormalizeText(source_term.listener_source_name))
  );

  return [...merged_terms, ...source_only_terms].slice(0, MAX_ADDRESS_TERMS);
}

function MergeSpeechProfile(
  target_profile: SpeechProfile | undefined,
  source_profile: SpeechProfile | undefined
): SpeechProfile | undefined {
  if (!target_profile || !source_profile) {
    return target_profile ?? source_profile;
  }

  return {
    self_pronoun: PickControlledValue(
      target_profile.self_pronoun,
      source_profile.self_pronoun
    ),
    sentence_ending: PickControlledValue(
      target_profile.sentence_ending,
      source_profile.sentence_ending
    ),
    address_terms: MergeAddressTerms(
      target_profile.address_terms,
      source_profile.address_terms
    )
  };
}

function MergeSpeech(
  target: EntityRecord['speech'],
  source: EntityRecord['speech']
): EntityRecord['speech'] {
  const speech: EntityRecord['speech'] = { ...target };

  for (const target_language of MERGE_TARGET_LANGUAGES) {
    const profile = MergeSpeechProfile(
      target[target_language],
      source[target_language]
    );

    if (profile) speech[target_language] = profile;
  }

  return speech;
}

function MergeNameVariants(
  target: EntityRecord['name_variants'],
  source: EntityRecord['name_variants']
): EntityRecord['name_variants'] {
  const name_variants: EntityRecord['name_variants'] = { ...target };

  for (const target_language of MERGE_TARGET_LANGUAGES) {
    const target_variants = target[target_language];
    const source_variants = source[target_language];

    if (!target_variants && !source_variants) continue;
    name_variants[target_language] = [
      ...new Set([...(target_variants ?? []), ...(source_variants ?? [])])
    ].slice(0, MAX_NAME_VARIANTS);
  }

  return name_variants;
}

// Spec 0004 §8.2 then §8.4: when the merged translation is not the target's,
// the target's old text becomes a wrong spelling of the new one.
function ApplyTranslationChanges(
  entity: EntityRecord,
  old_translations: EntityRecord['translations'],
  entities: readonly EntityRecord[]
): EntityRecord {
  const name_variants: EntityRecord['name_variants'] = {
    ...entity.name_variants
  };

  for (const target_language of MERGE_TARGET_LANGUAGES) {
    const old_text = old_translations[target_language]?.text ?? '';
    const new_text = entity.translations[target_language]?.text ?? '';
    const merged_variants = name_variants[target_language];

    // §8.4 step 2 also holds when the translation is unchanged: a source
    // variant can equal the kept translation.
    if (old_text === '' || new_text === old_text) {
      if (merged_variants?.includes(new_text)) {
        name_variants[target_language] = merged_variants.filter(
          variant => variant !== new_text
        );
      }

      continue;
    }

    const variants = UpdateVariantsForNewTranslation({
      variants: name_variants[target_language] ?? [],
      old_text,
      new_text,
      other_translations: entities
        .filter(other => other.entity_id !== entity.entity_id)
        .flatMap(other => other.translations[target_language]?.text ?? [])
    });

    // A language without wrong spellings keeps no empty list.
    if (variants.length > 0 || name_variants[target_language]) {
      name_variants[target_language] = variants;
    }
  }

  return { ...entity, name_variants };
}

function MergeTranslations(
  target: EntityRecord['translations'],
  source: EntityRecord['translations']
): EntityRecord['translations'] {
  const translations: EntityRecord['translations'] = { ...target };

  for (const target_language of MERGE_TARGET_LANGUAGES) {
    const target_translation = target[target_language];
    const source_translation = source[target_language];

    if (!source_translation) continue;

    const should_take_source =
      !target_translation ||
      (IsUserControlled(source_translation) &&
        !IsUserControlled(target_translation));

    if (should_take_source) translations[target_language] = source_translation;
  }

  return translations;
}

function MergeEntity(
  target: EntityRecord,
  source: EntityRecord,
  now_iso: string
): EntityRecord {
  const source_aliases = DeduplicateByNormalizedText(
    [...target.source_aliases, ...source.source_aliases],
    [target.normalized_source_name]
  );
  const is_target_notes_empty = target.notes_en === '';

  return {
    ...target,
    translations: MergeTranslations(target.translations, source.translations),
    speech: MergeSpeech(target.speech, source.speech),
    name_variants: MergeNameVariants(
      target.name_variants,
      source.name_variants
    ),
    gender: target.gender === 'unknown' ? source.gender : target.gender,
    notes_en: is_target_notes_empty ? source.notes_en : target.notes_en,
    notes_origin: is_target_notes_empty
      ? source.notes_origin
      : target.notes_origin,
    source_aliases,
    normalized_source_aliases: source_aliases.map(NormalizeText),
    first_seen_chapter:
      target.first_seen_chapter === ''
        ? source.first_seen_chapter
        : target.first_seen_chapter,
    last_seen_at: PickLater(target.last_seen_at, source.last_seen_at),
    created_at: PickEarlier(target.created_at, source.created_at),
    updated_at: now_iso
  };
}

function MergeEntities(
  target_entities: EntityRecord[],
  source_entities: EntityRecord[],
  target_series_id: string,
  now_iso: string
): { entities: EntityRecord[]; merged_entity_count: number } {
  const entities = [...target_entities];
  const old_translations_by_index = new Map<
    number,
    EntityRecord['translations']
  >();
  let merged_entity_count = 0;

  for (const source_entity of source_entities) {
    const match_index = entities.findIndex(
      entity =>
        entity.normalized_source_name === source_entity.normalized_source_name
    );

    if (match_index === -1) {
      entities.push({ ...source_entity, series_id: target_series_id });
      continue;
    }

    if (!old_translations_by_index.has(match_index)) {
      old_translations_by_index.set(
        match_index,
        entities[match_index].translations
      );
    }

    entities[match_index] = MergeEntity(
      entities[match_index],
      source_entity,
      now_iso
    );
    merged_entity_count++;
  }

  // Condition 4 of §8.4 needs every merged translation, so it runs last.
  const checked_entities = entities.map((entity, entity_index) => {
    const old_translations = old_translations_by_index.get(entity_index);

    return old_translations
      ? ApplyTranslationChanges(entity, old_translations, entities)
      : entity;
  });

  return { entities: checked_entities, merged_entity_count };
}

export function MergeSeriesBundles(
  target: SeriesBundle,
  source: SeriesBundle,
  now_iso: string
): SeriesMergeResult {
  const target_series_id = target.series.series_id;
  const { series, added_alias_count } = MergeSeriesRecord(
    target.series,
    source.series,
    now_iso
  );
  const { site_bindings, moved_binding_count } = MergeBindings(
    target.site_bindings,
    source.site_bindings,
    target_series_id
  );
  const { chapters, merged_chapter_count } = MergeChapters(
    target.chapters,
    source.chapters,
    target_series_id,
    now_iso
  );
  const { entities, merged_entity_count } = MergeEntities(
    target.entities,
    source.entities,
    target_series_id,
    now_iso
  );

  return {
    bundle: { series, site_bindings, chapters, entities },
    added_alias_count,
    moved_binding_count,
    merged_chapter_count,
    merged_entity_count
  };
}
