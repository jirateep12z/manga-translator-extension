import { IsRecord } from '@/lib/is-record';
import { NormalizeText } from '@/lib/normalize-text';
import type {
  AddressTerm,
  ChapterRecord,
  EntityRecord,
  EntityTranslation,
  PageNote,
  SiteBindingRecord,
  SpeechProfile,
  SpeechValue
} from '@/services/database';
import type { TargetLanguage } from '@/types/target-language';
import {
  IMPORT_TEXT_LIMITS,
  MAX_ADDRESS_TERMS,
  MAX_NAME_VARIANTS,
  MAX_SOURCE_URLS_PER_CHAPTER,
  TEXT_LIMITS
} from '../constants/memory';
import type {
  ExportedSeries,
  MemoryExportFile,
  MemoryImportValidation
} from '../types/memory';

const NOT_AN_EXPORT_ERROR = 'The file is not a Manga Translator memory export.';
const IMPORT_TARGET_LANGUAGES: TargetLanguage[] = ['th', 'en'];
const ENTITY_KINDS = ['character', 'term'] as const;
const GENDERS = ['male', 'female', 'unknown'] as const;
const ORIGINS = ['ai', 'user'] as const;
const CHAPTER_STATUSES = ['in_progress', 'summarized'] as const;

class ImportValidationError extends Error {}

function IsValidDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

const MAX_UTF16_UNITS_PER_CODE_POINT = 2;

function IsLongerThan(value: string, max_code_points: number): boolean {
  if (value.length <= max_code_points) return false;
  if (value.length > max_code_points * MAX_UTF16_UNITS_PER_CODE_POINT) {
    return true;
  }

  return Array.from(value).length > max_code_points;
}

function Fail(
  path: string,
  reason: 'required' | 'too long' | 'invalid'
): never {
  throw new ImportValidationError(`${path} is ${reason}.`);
}

function ReadString(
  value: unknown,
  path: string,
  max_length: number,
  is_required = false
): string {
  if (typeof value !== 'string') Fail(path, 'invalid');
  if (is_required && value.trim() === '') Fail(path, 'required');
  if (IsLongerThan(value, max_length)) Fail(path, 'too long');

  return value;
}

function ReadNullableString(
  value: unknown,
  path: string,
  max_length: number
): string | null {
  return value === null ? null : ReadString(value, path, max_length);
}

function ReadTimestamp(value: unknown, path: string): string {
  if (typeof value !== 'string' || !IsValidDate(value)) Fail(path, 'invalid');

  return value;
}

function ReadNullableTimestamp(value: unknown, path: string): string | null {
  return value === null ? null : ReadTimestamp(value, path);
}

function ReadEnum<TValue extends string>(
  value: unknown,
  path: string,
  valid_values: readonly TValue[]
): TValue {
  if (typeof value !== 'string' || !valid_values.includes(value as TValue)) {
    Fail(path, 'invalid');
  }

  return value as TValue;
}

function ReadBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') Fail(path, 'invalid');

  return value;
}

function ReadIndex(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    Fail(path, 'invalid');
  }

  return value;
}

function ReadArray(
  value: unknown,
  path: string,
  max_length = Number.POSITIVE_INFINITY
): unknown[] {
  if (!Array.isArray(value) || value.length > max_length) {
    Fail(path, 'invalid');
  }

  return value;
}

function ReadRecord(value: unknown, path: string): Record<string, unknown> {
  if (!IsRecord(value) || Array.isArray(value)) Fail(path, 'invalid');

  return value;
}

function ReadBinding(value: unknown, path: string): SiteBindingRecord {
  const record = ReadRecord(value, path);

  return {
    binding_id: ReadString(
      record.binding_id,
      `${path}.binding_id`,
      IMPORT_TEXT_LIMITS.id,
      true
    ),
    hostname: ReadString(
      record.hostname,
      `${path}.hostname`,
      IMPORT_TEXT_LIMITS.hostname,
      true
    ),
    series_path_pattern: ReadNullableString(
      record.series_path_pattern,
      `${path}.series_path_pattern`,
      IMPORT_TEXT_LIMITS.url
    ),
    series_id: '',
    confirmed_at: ReadTimestamp(record.confirmed_at, `${path}.confirmed_at`)
  };
}

function ReadPageNote(value: unknown, path: string): PageNote {
  const record = ReadRecord(value, path);

  return {
    page_index: ReadIndex(record.page_index, `${path}.page_index`),
    note_en: ReadString(
      record.note_en,
      `${path}.note_en`,
      TEXT_LIMITS.page_note
    )
  };
}

function ReadChapter(value: unknown, path: string): ChapterRecord {
  const record = ReadRecord(value, path);

  return {
    series_id: '',
    chapter_number: ReadString(
      record.chapter_number,
      `${path}.chapter_number`,
      IMPORT_TEXT_LIMITS.url,
      true
    ),
    chapter_label: ReadString(
      record.chapter_label,
      `${path}.chapter_label`,
      IMPORT_TEXT_LIMITS.url
    ),
    page_notes: ReadArray(record.page_notes, `${path}.page_notes`).map(
      (page_note, index) =>
        ReadPageNote(page_note, `${path}.page_notes[${index}]`)
    ),
    notes_hostname: ReadNullableString(
      record.notes_hostname,
      `${path}.notes_hostname`,
      IMPORT_TEXT_LIMITS.hostname
    ),
    notes_updated_at: ReadNullableTimestamp(
      record.notes_updated_at,
      `${path}.notes_updated_at`
    ),
    summary_en: ReadString(
      record.summary_en,
      `${path}.summary_en`,
      TEXT_LIMITS.summary
    ),
    summarized_at: ReadNullableTimestamp(
      record.summarized_at,
      `${path}.summarized_at`
    ),
    status: ReadEnum(record.status, `${path}.status`, CHAPTER_STATUSES),
    source_urls: ReadArray(
      record.source_urls,
      `${path}.source_urls`,
      MAX_SOURCE_URLS_PER_CHAPTER
    ).map((source_url, index) =>
      ReadString(
        source_url,
        `${path}.source_urls[${index}]`,
        IMPORT_TEXT_LIMITS.url
      )
    ),
    created_at: ReadTimestamp(record.created_at, `${path}.created_at`),
    updated_at: ReadTimestamp(record.updated_at, `${path}.updated_at`)
  };
}

function ReadTranslation(value: unknown, path: string): EntityTranslation {
  const record = ReadRecord(value, path);

  return {
    text: ReadString(
      record.text,
      `${path}.text`,
      TEXT_LIMITS.entity_translation
    ),
    origin: ReadEnum(record.origin, `${path}.origin`, ORIGINS),
    is_locked: ReadBoolean(record.is_locked, `${path}.is_locked`)
  };
}

function ReadTranslations(
  value: unknown,
  path: string
): EntityRecord['translations'] {
  const record = ReadRecord(value, path);
  const translations: EntityRecord['translations'] = {};

  for (const target_language of IMPORT_TARGET_LANGUAGES) {
    if (record[target_language] === undefined) continue;
    translations[target_language] = ReadTranslation(
      record[target_language],
      `${path}.${target_language}`
    );
  }

  return translations;
}

function ReadSpeechValue(
  value: unknown,
  path: string,
  is_text_required: boolean
): SpeechValue | null {
  if (value === null) return null;

  const record = ReadRecord(value, path);

  return {
    text: ReadString(
      record.text,
      `${path}.text`,
      TEXT_LIMITS.speech_value,
      is_text_required
    ),
    origin: ReadEnum(record.origin, `${path}.origin`, ORIGINS),
    is_locked: ReadBoolean(record.is_locked, `${path}.is_locked`)
  };
}

function ReadAddressTerm(value: unknown, path: string): AddressTerm {
  const record = ReadRecord(value, path);

  return {
    listener_source_name: ReadString(
      record.listener_source_name,
      `${path}.listener_source_name`,
      TEXT_LIMITS.source_name,
      true
    ),
    term: ReadString(
      record.term,
      `${path}.term`,
      TEXT_LIMITS.address_term,
      true
    ),
    origin: ReadEnum(record.origin, `${path}.origin`, ORIGINS),
    is_locked: ReadBoolean(record.is_locked, `${path}.is_locked`)
  };
}

function ReadSpeechProfile(value: unknown, path: string): SpeechProfile {
  const record = ReadRecord(value, path);

  return {
    self_pronoun: ReadSpeechValue(
      record.self_pronoun,
      `${path}.self_pronoun`,
      true
    ),
    // An ending of '' means the speaker uses none.
    sentence_ending: ReadSpeechValue(
      record.sentence_ending,
      `${path}.sentence_ending`,
      false
    ),
    address_terms: ReadArray(
      record.address_terms,
      `${path}.address_terms`,
      MAX_ADDRESS_TERMS
    ).map((address_term, index) =>
      ReadAddressTerm(address_term, `${path}.address_terms[${index}]`)
    )
  };
}

function ReadSpeech(value: unknown, path: string): EntityRecord['speech'] {
  const record = ReadRecord(value, path);
  const speech: EntityRecord['speech'] = {};

  for (const target_language of IMPORT_TARGET_LANGUAGES) {
    if (record[target_language] === undefined) continue;
    speech[target_language] = ReadSpeechProfile(
      record[target_language],
      `${path}.${target_language}`
    );
  }

  return speech;
}

function ReadNameVariants(
  value: unknown,
  path: string
): EntityRecord['name_variants'] {
  const record = ReadRecord(value, path);
  const name_variants: EntityRecord['name_variants'] = {};

  for (const target_language of IMPORT_TARGET_LANGUAGES) {
    if (record[target_language] === undefined) continue;

    const language_path = `${path}.${target_language}`;

    name_variants[target_language] = ReadArray(
      record[target_language],
      language_path,
      MAX_NAME_VARIANTS
    ).map((variant, index) =>
      ReadString(
        variant,
        `${language_path}[${index}]`,
        TEXT_LIMITS.entity_translation,
        true
      )
    );
  }

  return name_variants;
}

function ReadEntity(value: unknown, path: string): EntityRecord {
  const record = ReadRecord(value, path);
  const source_name = ReadString(
    record.source_name,
    `${path}.source_name`,
    TEXT_LIMITS.source_name,
    true
  );
  const source_aliases = ReadArray(
    record.source_aliases,
    `${path}.source_aliases`
  ).map((source_alias, index) =>
    ReadString(
      source_alias,
      `${path}.source_aliases[${index}]`,
      TEXT_LIMITS.source_name
    )
  );

  const notes_origin = ReadEnum(
    record.notes_origin,
    `${path}.notes_origin`,
    ORIGINS
  );

  // Amendment U3: an entity exported before spec 0004 has no speech fields
  // and no kind origin; they are read like a stored record of that age.
  return {
    entity_id: ReadString(
      record.entity_id,
      `${path}.entity_id`,
      IMPORT_TEXT_LIMITS.id,
      true
    ),
    series_id: '',
    kind: ReadEnum(record.kind, `${path}.kind`, ENTITY_KINDS),
    kind_origin:
      record.kind_origin === undefined
        ? notes_origin
        : ReadEnum(record.kind_origin, `${path}.kind_origin`, ORIGINS),
    source_name,
    normalized_source_name: NormalizeText(source_name),
    source_aliases,
    normalized_source_aliases: source_aliases.map(NormalizeText),
    gender: ReadEnum(record.gender, `${path}.gender`, GENDERS),
    notes_en: ReadString(
      record.notes_en,
      `${path}.notes_en`,
      TEXT_LIMITS.notes_en
    ),
    notes_origin,
    translations: ReadTranslations(record.translations, `${path}.translations`),
    speech:
      record.speech === undefined
        ? {}
        : ReadSpeech(record.speech, `${path}.speech`),
    name_variants:
      record.name_variants === undefined
        ? {}
        : ReadNameVariants(record.name_variants, `${path}.name_variants`),
    first_seen_chapter: ReadString(
      record.first_seen_chapter,
      `${path}.first_seen_chapter`,
      IMPORT_TEXT_LIMITS.url
    ),
    last_seen_at: ReadTimestamp(record.last_seen_at, `${path}.last_seen_at`),
    created_at: ReadTimestamp(record.created_at, `${path}.created_at`),
    updated_at: ReadTimestamp(record.updated_at, `${path}.updated_at`)
  };
}

function ReadSeries(value: unknown, path: string): ExportedSeries {
  const record = ReadRecord(value, path);
  const series_id = ReadString(
    record.series_id,
    `${path}.series_id`,
    IMPORT_TEXT_LIMITS.id,
    true
  );
  const aliases = ReadArray(record.aliases, `${path}.aliases`).map(
    (alias, index) =>
      ReadString(
        alias,
        `${path}.aliases[${index}]`,
        IMPORT_TEXT_LIMITS.title,
        true
      )
  );
  const site_bindings = ReadArray(
    record.site_bindings,
    `${path}.site_bindings`
  ).map((binding, index) => ({
    ...ReadBinding(binding, `${path}.site_bindings[${index}]`),
    series_id
  }));
  const chapters = ReadArray(record.chapters, `${path}.chapters`).map(
    (chapter, index) => ({
      ...ReadChapter(chapter, `${path}.chapters[${index}]`),
      series_id
    })
  );
  const entities = ReadArray(record.entities, `${path}.entities`).map(
    (entity, index) => ({
      ...ReadEntity(entity, `${path}.entities[${index}]`),
      series_id
    })
  );

  return {
    series_id,
    canonical_title: ReadString(
      record.canonical_title,
      `${path}.canonical_title`,
      IMPORT_TEXT_LIMITS.title,
      true
    ),
    aliases,
    normalized_aliases: aliases.map(NormalizeText),
    synopsis_en: ReadString(
      record.synopsis_en,
      `${path}.synopsis_en`,
      TEXT_LIMITS.summary
    ),
    // Exports made before spec 0005 have no setting, which means off.
    ...(record.is_auto_translate_enabled === undefined
      ? {}
      : {
          is_auto_translate_enabled: ReadBoolean(
            record.is_auto_translate_enabled,
            `${path}.is_auto_translate_enabled`
          )
        }),
    created_at: ReadTimestamp(record.created_at, `${path}.created_at`),
    updated_at: ReadTimestamp(record.updated_at, `${path}.updated_at`),
    site_bindings,
    chapters,
    entities
  };
}

function AssertUnique(values: string[], CreatePath: (index: number) => string) {
  const seen_values = new Set<string>();

  for (const [index, value] of values.entries()) {
    if (seen_values.has(value)) Fail(CreatePath(index), 'invalid');
    seen_values.add(value);
  }
}

function AssertUniqueKeys(series_list: ExportedSeries[]): void {
  AssertUnique(
    series_list.map(series => series.series_id),
    index => `series[${index}].series_id`
  );

  for (const [series_index, series] of series_list.entries()) {
    AssertUnique(
      series.chapters.map(chapter => chapter.chapter_number),
      index => `series[${series_index}].chapters[${index}].chapter_number`
    );
  }
}

function IsSupportedExport(raw: unknown): raw is Record<string, unknown> {
  return (
    IsRecord(raw) &&
    !Array.isArray(raw) &&
    typeof raw.exported_at === 'string' &&
    IsValidDate(raw.exported_at) &&
    Array.isArray(raw.series)
  );
}

export function ValidateMemoryImport(raw: unknown): MemoryImportValidation {
  if (!IsSupportedExport(raw)) {
    return { is_valid: false, error: NOT_AN_EXPORT_ERROR };
  }

  try {
    const file: MemoryExportFile = {
      exported_at: raw.exported_at as string,
      series: (raw.series as unknown[]).map((series, index) =>
        ReadSeries(series, `series[${index}]`)
      )
    };

    AssertUniqueKeys(file.series);

    return { is_valid: true, file };
  } catch (error) {
    if (error instanceof ImportValidationError) {
      return { is_valid: false, error: error.message };
    }

    throw error;
  }
}
