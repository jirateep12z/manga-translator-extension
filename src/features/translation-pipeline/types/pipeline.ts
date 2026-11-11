import type { ReportedEntity, SpeechObservation } from '@/features/memory';
import type { TargetLanguage } from '@/features/settings';
import type {
  BboxPx,
  RegionAppearance,
  RegionKind,
  RegionTranslation,
  SourceLanguage
} from '@/services/database';

export type ImageTile = {
  tile_index: number;
  source_x_px: number;
  source_y_px: number;
  source_width_px: number;
  source_height_px: number;
  output_width_px: number;
  output_height_px: number;
};
export type NormalizedBox = [number, number, number, number];
export type NormalizedRegion = {
  bbox: NormalizedBox;
  source_text: string;
  kind: RegionKind;
};
export type ImageReadingResponse = {
  source_language: SourceLanguage;
  regions: NormalizedRegion[];
};
export type NameUse = {
  source_name: string;
  source_form: string;
  rendered: string;
};
export type TranslatedRegion = RegionTranslation & { names_used: NameUse[] };
export type TranslationResponse = {
  translations: TranslatedRegion[];
  new_entities: ReportedEntity[];
  speech_observations: SpeechObservation[];
  page_note_en: string;
};
export type FinalizationResponse = {
  chapter_summary_en: string;
  synopsis_en: string;
};
export type ValidationResult<T> =
  { is_valid: true; value: T } | { is_valid: false; error: string };
export type NameViolation = {
  region_id: string;
  matched_name: string;
  expected_translation: string;
};
export type SpeechViolation = {
  region_id: string;
  kind:
    'alternative_form' | 'self_pronoun' | 'sentence_ending' | 'address_term';
  // '' when the rule has no speaker.
  speaker: string;
  // The required form, or for alternative_form the matched text.
  expected: string;
  // '' unless kind is address_term.
  listener: string;
};
export type ForeignScriptViolation = {
  region_id: string;
  /**
   * Each distinct run of letters outside the target language's scripts, with
   * the marks written on them, in order.
   */
  foreign_text_runs: string[];
};
export type CssRect = { x: number; y: number; width: number; height: number }; // viewport CSS pixels
export type CropRectPx = {
  x_px: number;
  y_px: number;
  width_px: number;
  height_px: number;
};
export type ImageSource =
  // `is_referrer_hidden`: the page loads the image without a Referer.
  | { type: 'url'; image_url: string; is_referrer_hidden: boolean }
  | { type: 'inline'; image_base64: string; mime_type: string }
  | {
      type: 'capture';
      image_url: string;
      rect_css_px: CssRect;
      device_pixel_ratio: number;
    };
export type PageJob = {
  series_id: string;
  chapter_number: string;
  page_index: number;
  page_url: string;
  page_hostname: string;
  image_source: ImageSource;
  target_language: TargetLanguage;
  is_retranslation: boolean;
  // Serve only cached results, with no AI call, OCR run, or capture
  // (spec 0005 §5).
  is_cache_only: boolean;
};
export type RenderedRegion = {
  region_id: string;
  bbox_px: BboxPx;
  kind: RegionKind;
  source_text: string;
  translated_text: string | null;
  appearance: RegionAppearance | null;
};
export type PageOutcome =
  | 'translated'
  | 'translated_with_warnings'
  | 'no_text'
  | 'already_in_target_language';
export type PageTranslationResult = {
  page_index: number;
  outcome: PageOutcome;
  image_width_px: number;
  image_height_px: number;
  source_language: SourceLanguage;
  target_language: TargetLanguage;
  regions: RenderedRegion[];
};
export type PageEnvironment = {
  tab_id: number;
  window_id: number;
  signal: AbortSignal;
  OnCaptureDone: () => void;
};
