import type {
  ChapterRecord,
  EntityKind,
  EntityRecord,
  Gender,
  PageNote,
  SeriesRecord,
  SiteBindingRecord,
  SpeechProfile
} from '@/services/database';
import type { TargetLanguage } from '@/types/target-language';

export type ReportedEntity = {
  kind: EntityKind;
  source_name: string;
  source_aliases: string[];
  translation: string;
  gender: Gender;
  notes_en: string;
};

export type SpeechObservation = {
  speaker: string;
  self_pronoun: string;
  sentence_ending: string;
  addresses: { listener: string; term: string }[];
};

export type AliasCandidate = { entity_id: string; alias: string };

export type LearnedNameVariant = { entity_id: string; text: string };

export type MemoryContextEntity = {
  entity_id: string;
  kind: EntityKind;
  source_name: string;
  source_aliases: string[];
  translation: string | null;
  is_locked: boolean;
  gender: Gender;
  notes_en: string;
  // Target language only.
  name_variants: string[];
  // Target language only; null for terms. Address terms are limited to
  // listeners that are also context entities.
  speech: SpeechProfile | null;
};

export type PreviousChapterSummary = {
  chapter_number: string;
  summary_en: string;
};

export type DialogueLine = {
  page_index: number;
  // '' when unknown.
  speaker: string;
  source_text: string;
  translated_text: string;
};

export type DialoguePage = {
  page_index: number;
  // In region order.
  lines: Omit<DialogueLine, 'page_index'>[];
};

export type MemoryContext = {
  entities: MemoryContextEntity[];
  synopsis_en: string;
  previous_chapter_summaries: PreviousChapterSummary[];
  current_chapter_notes: PageNote[];
  // Oldest first.
  previous_lines: DialogueLine[];
};

export type EntityUserPatch = {
  translations?: Partial<
    Record<TargetLanguage, { text: string; is_locked: boolean }>
  >;
  gender?: Gender;
  notes_en?: string;
  source_aliases?: string[];
  kind?: EntityKind;
  // Replaces that language's profile; the service sets each value's origin.
  speech?: Partial<Record<TargetLanguage, SpeechProfilePatch>>;
  // Only removals take effect.
  name_variants?: Partial<Record<TargetLanguage, string[]>>;
};

export type SpeechValuePatch = { text: string; is_locked: boolean } | null;

export type SpeechProfilePatch = {
  self_pronoun: SpeechValuePatch;
  // text '' = the speaker uses no ending.
  sentence_ending: SpeechValuePatch;
  address_terms: {
    listener_source_name: string;
    term: string;
    is_locked: boolean;
  }[];
};

export type SeriesBundle = {
  series: SeriesRecord;
  site_bindings: SiteBindingRecord[];
  chapters: ChapterRecord[];
  entities: EntityRecord[];
};

export type SeriesMergeResult = {
  bundle: SeriesBundle;
  added_alias_count: number;
  moved_binding_count: number;
  merged_chapter_count: number;
  merged_entity_count: number;
};

export type SeriesMergePreview = {
  alias_count: number;
  binding_count: number;
  chapter_count: number;
  merged_chapter_count: number;
  entity_count: number;
  merged_entity_count: number;
};

export type ExportedSeries = SeriesRecord & {
  site_bindings: SiteBindingRecord[];
  chapters: ChapterRecord[];
  entities: EntityRecord[];
};

export type MemoryExportFile = {
  exported_at: string;
  series: ExportedSeries[];
};

export type MemoryImportValidation =
  | { is_valid: true; file: MemoryExportFile }
  | { is_valid: false; error: string };

export type MemoryImportPreview = {
  new_series_count: number;
  merged_series_count: number;
  entity_count: number;
};
