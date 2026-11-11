export const MAX_CONTEXT_ENTITIES = 60;
export const MAX_CONTEXT_CHAPTER_SUMMARIES = 3;
export const MAX_SOURCE_URLS_PER_CHAPTER = 20;
export const MAX_CONTEXT_DIALOGUE_LINES = 40;
// Code points, summed over source_text and translated_text.
export const MAX_CONTEXT_DIALOGUE_CHARS = 4000;
export const MAX_DIALOGUE_PAGES_SCANNED = 30;
export const MAX_ADDRESS_TERMS = 10;
export const MAX_NAME_VARIANTS = 10;
// Limits only aliases that AI adds; user-added aliases are always kept.
export const MAX_SOURCE_ALIASES = 20;
export const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;

export const TEXT_LIMITS = {
  source_name: 100,
  entity_translation: 100,
  notes_en: 300,
  page_note: 400,
  summary: 1500,
  speech_value: 20,
  address_term: 100
} as const;

export const IMPORT_TEXT_LIMITS = {
  id: 100,
  title: 300,
  hostname: 253,
  url: 2048
} as const;
