import type { ImageReader } from '@/types/image-reader';
import type { RgbColor } from '@/types/rgb-color';
import type { TargetLanguage } from '@/types/target-language';
import type { DBSchema } from 'idb';

export type SourceLanguage = 'ja' | 'ko' | 'zh' | 'en' | 'other';
export type EntityKind = 'character' | 'term';
export type Gender = 'male' | 'female' | 'unknown';
export type ChapterStatus = 'in_progress' | 'summarized';
export type RegionKind = 'speech' | 'narration' | 'sfx';

export type BboxPx = {
  x_px: number;
  y_px: number;
  width_px: number;
  height_px: number;
};

export type RegionFrame = 'closed' | 'open';
export type RegionBackdrop = 'flat' | 'textured';
export type RegionLettering = 'text' | 'display' | 'display_large';

export type RegionAppearance = {
  background_color: RgbColor;
  ink_color: RgbColor;
  frame: RegionFrame;
  backdrop: RegionBackdrop;
  lettering: RegionLettering;
  glyph_size_px: number;
  is_vertical: boolean;
  cover_box_px: BboxPx;
  text_box_candidates_px: BboxPx[]; // 1–8, the padded original box first
};

export type TextRegion = {
  region_id: string;
  bbox_px: BboxPx;
  kind: RegionKind;
  source_text: string;
  // Missing before spec 0003, and on regions that were not analyzed.
  appearance?: RegionAppearance;
};

export type RegionTranslation = {
  region_id: string;
  text: string;
  // The speaker entity's source_name; present only when the model named one.
  speaker_source_name?: string;
  // Present only when stage 2 flagged the region as a sound effect
  // (spec 0003 §21).
  is_sound_effect?: true;
};

export type EntityTranslation = {
  text: string;
  origin: 'ai' | 'user';
  is_locked: boolean;
};

export type SpeechValue = {
  text: string;
  origin: 'ai' | 'user';
  is_locked: boolean;
};

export type AddressTerm = {
  // The listener entity's source_name.
  listener_source_name: string;
  term: string;
  origin: 'ai' | 'user';
  is_locked: boolean;
};

export type SpeechProfile = {
  // Thai only; null means unknown.
  self_pronoun: SpeechValue | null;
  // Thai only; null means unknown, and text '' means no ending particle.
  sentence_ending: SpeechValue | null;
  address_terms: AddressTerm[];
};

export type PageNote = {
  page_index: number;
  note_en: string;
};

export type SeriesRecord = {
  series_id: string;
  canonical_title: string;
  aliases: string[];
  normalized_aliases: string[];
  synopsis_en: string;
  // Absent means off (spec 0005 §3.1).
  is_auto_translate_enabled?: boolean;
  created_at: string;
  updated_at: string;
};

export type SiteBindingRecord = {
  binding_id: string;
  hostname: string;
  series_path_pattern: string | null;
  series_id: string;
  confirmed_at: string;
};

export type ChapterRecord = {
  series_id: string;
  chapter_number: string;
  chapter_label: string;
  page_notes: PageNote[];
  notes_hostname: string | null;
  notes_updated_at: string | null;
  summary_en: string;
  summarized_at: string | null;
  status: ChapterStatus;
  source_urls: string[];
  created_at: string;
  updated_at: string;
};

export type EntityRecord = {
  entity_id: string;
  series_id: string;
  kind: EntityKind;
  // 'user' once the user creates the entity or changes its kind; AI only
  // promotes an 'ai' term to a character (spec 0004 amendment U3).
  kind_origin: 'ai' | 'user';
  source_name: string;
  normalized_source_name: string;
  source_aliases: string[];
  normalized_source_aliases: string[];
  gender: Gender;
  notes_en: string;
  notes_origin: 'ai' | 'user';
  translations: Partial<Record<TargetLanguage, EntityTranslation>>;
  speech: Partial<Record<TargetLanguage, SpeechProfile>>;
  // Wrong spellings of translations[language].text seen in model output.
  name_variants: Partial<Record<TargetLanguage, string[]>>;
  first_seen_chapter: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

export type PageReadingRecord = {
  reading_key: string;
  image_url: string;
  width_px: number;
  height_px: number;
  source_language: SourceLanguage;
  regions: TextRegion[];
  model: string;
  // Missing on readings saved before spec 0002, which the AI reader made.
  reader?: ImageReader;
  // The region-appearance analysis version that last processed this reading. Missing before spec 0003.
  appearance_version?: number;
  created_at: string;
  last_used_at: string;
};

export type PageTranslationRecord = {
  reading_key: string;
  target_language: TargetLanguage;
  series_id: string;
  chapter_number: string;
  page_index: number;
  page_hostname: string;
  translations: RegionTranslation[];
  model: string;
  created_at: string;
};

export interface MangaTranslatorSchema extends DBSchema {
  series: {
    key: string;
    value: SeriesRecord;
  };
  site_bindings: {
    key: string;
    value: SiteBindingRecord;
    indexes: { by_hostname: string; by_series: string };
  };
  chapters: {
    key: [string, string];
    value: ChapterRecord;
    indexes: { by_series: string };
  };
  entities: {
    key: string;
    value: EntityRecord;
    indexes: { by_series: string; by_series_name: [string, string] };
  };
  page_readings: {
    key: string;
    value: PageReadingRecord;
    indexes: { by_image_url: string; by_last_used: string };
  };
  page_translations: {
    key: [string, TargetLanguage];
    value: PageTranslationRecord;
    indexes: {
      by_chapter: [string, string];
      by_chapter_page: [string, string, TargetLanguage, number];
      by_reading: string;
    };
  };
}
