import {
  TEXT_LIMITS,
  TruncateText,
  type ReportedEntity,
  type SpeechObservation
} from '@/features/memory';
import { IsRecord } from '@/lib/is-record';
import { NormalizeText } from '@/lib/normalize-text';
import type { EntityKind, Gender } from '@/services/database';
import type {
  FinalizationResponse,
  NameUse,
  TranslatedRegion,
  TranslationResponse,
  ValidationResult
} from '../types/pipeline';

const ENTITY_KINDS: ReadonlySet<string> = new Set(['character', 'term']);
const GENDERS: ReadonlySet<string> = new Set(['male', 'female', 'unknown']);
// Caps on the fields spec 0004 adds (spec 0004 §5.5).
const MAX_NAME_USES_PER_TRANSLATION = 10;
const MAX_REPORTED_ALIASES = 10;
const MAX_SPEECH_OBSERVATIONS = 20;
const MAX_ADDRESSES_PER_OBSERVATION = 10;

function ReadTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function ReadLimitedString(value: unknown, max_length: number): string {
  return TruncateText(ReadTrimmedString(value), max_length);
}

function ReadArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function ReadNameUse(value: unknown): NameUse | null {
  if (!IsRecord(value)) return null;

  const source_name = ReadLimitedString(
    value.source_name,
    TEXT_LIMITS.source_name
  );

  if (source_name === '') return null;

  return {
    source_name,
    source_form: ReadLimitedString(value.source_form, TEXT_LIMITS.source_name),
    rendered: ReadLimitedString(value.rendered, TEXT_LIMITS.address_term)
  };
}

function ReadNameUses(value: unknown): NameUse[] {
  return ReadArray(value)
    .map(ReadNameUse)
    .filter((name_use): name_use is NameUse => name_use !== null)
    .slice(0, MAX_NAME_USES_PER_TRANSLATION);
}

function ReadTranslations(
  values: unknown[],
  region_ids: readonly string[]
): TranslatedRegion[] {
  const known_region_ids = new Set(region_ids);
  const seen_region_ids = new Set<string>();
  const translations: TranslatedRegion[] = [];

  for (const value of values) {
    if (!IsRecord(value) || typeof value.region_id !== 'string') continue;

    const text = ReadTrimmedString(value.text);
    const is_kept =
      known_region_ids.has(value.region_id) &&
      !seen_region_ids.has(value.region_id) &&
      text !== '';

    if (!is_kept) continue;
    seen_region_ids.add(value.region_id);

    const speaker_source_name = ReadLimitedString(
      value.speaker,
      TEXT_LIMITS.source_name
    );

    translations.push({
      region_id: value.region_id,
      text,
      ...(speaker_source_name === '' ? {} : { speaker_source_name }),
      ...(value.is_sound_effect === true
        ? { is_sound_effect: true as const }
        : {}),
      names_used: ReadNameUses(value.names_used)
    });
  }

  return translations;
}

function ReadSourceAliases(value: unknown, source_name: string): string[] {
  const normalized_source_name = NormalizeText(source_name);

  return ReadArray(value)
    .map(alias => ReadLimitedString(alias, TEXT_LIMITS.source_name))
    .filter(
      alias => alias !== '' && NormalizeText(alias) !== normalized_source_name
    )
    .slice(0, MAX_REPORTED_ALIASES);
}

function ReadEntity(value: unknown): ReportedEntity | null {
  if (!IsRecord(value)) return null;

  const source_name = ReadLimitedString(
    value.source_name,
    TEXT_LIMITS.source_name
  );
  const translation = ReadLimitedString(
    value.translation,
    TEXT_LIMITS.entity_translation
  );
  const is_valid_kind =
    typeof value.kind === 'string' && ENTITY_KINDS.has(value.kind);

  if (!is_valid_kind || source_name === '' || translation === '') return null;

  return {
    kind: value.kind as EntityKind,
    source_name,
    source_aliases: ReadSourceAliases(value.source_aliases, source_name),
    translation,
    gender:
      typeof value.gender === 'string' && GENDERS.has(value.gender)
        ? (value.gender as Gender)
        : 'unknown',
    notes_en: ReadLimitedString(value.notes_en, TEXT_LIMITS.notes_en)
  };
}

function ReadAddress(value: unknown): SpeechObservation['addresses'][number] {
  const record = IsRecord(value) ? value : {};

  return {
    listener: ReadLimitedString(record.listener, TEXT_LIMITS.source_name),
    term: ReadLimitedString(record.term, TEXT_LIMITS.address_term)
  };
}

function ReadSpeechObservation(value: unknown): SpeechObservation | null {
  if (!IsRecord(value)) return null;

  return {
    speaker: ReadLimitedString(value.speaker, TEXT_LIMITS.source_name),
    self_pronoun: ReadLimitedString(
      value.self_pronoun,
      TEXT_LIMITS.speech_value
    ),
    sentence_ending: ReadLimitedString(
      value.sentence_ending,
      TEXT_LIMITS.speech_value
    ),
    addresses: ReadArray(value.addresses)
      .map(ReadAddress)
      .slice(0, MAX_ADDRESSES_PER_OBSERVATION)
  };
}

export function ValidateTranslationResponse(
  raw: unknown,
  region_ids: readonly string[]
): ValidationResult<TranslationResponse> {
  if (!IsRecord(raw)) {
    return { is_valid: false, error: 'Response must be a JSON object.' };
  }

  if (!Array.isArray(raw.translations)) {
    return { is_valid: false, error: '"translations" must be an array.' };
  }

  return {
    is_valid: true,
    value: {
      translations: ReadTranslations(raw.translations, region_ids),
      new_entities: ReadArray(raw.new_entities)
        .map(ReadEntity)
        .filter((entity): entity is ReportedEntity => entity !== null),
      speech_observations: ReadArray(raw.speech_observations)
        .map(ReadSpeechObservation)
        .filter(
          (observation): observation is SpeechObservation =>
            observation !== null
        )
        .slice(0, MAX_SPEECH_OBSERVATIONS),
      page_note_en: ReadLimitedString(raw.page_note_en, TEXT_LIMITS.page_note)
    }
  };
}

export function ValidateFinalizationResponse(
  raw: unknown
): ValidationResult<FinalizationResponse> {
  if (!IsRecord(raw)) {
    return { is_valid: false, error: 'Response must be a JSON object.' };
  }

  const chapter_summary_en = ReadLimitedString(
    raw.chapter_summary_en,
    TEXT_LIMITS.summary
  );
  const synopsis_en = ReadLimitedString(raw.synopsis_en, TEXT_LIMITS.summary);

  if (chapter_summary_en === '' || synopsis_en === '') {
    return {
      is_valid: false,
      error: '"chapter_summary_en" and "synopsis_en" must be non-empty strings.'
    };
  }

  return { is_valid: true, value: { chapter_summary_en, synopsis_en } };
}
