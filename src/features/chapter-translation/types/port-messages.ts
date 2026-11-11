import type { TargetLanguage } from '@/features/settings';
import type {
  ImageSource,
  PageOutcome,
  PageTranslationResult,
  RenderedRegion
} from '@/features/translation-pipeline/types/pipeline';
import type { ErrorCode } from '@/types/error-code';

export type { ImageSource, PageOutcome, RenderedRegion };

export type TranslatePagePortMessage = {
  action: 'translate-page';
  series_id: string;
  chapter_number: string;
  page_index: number;
  page_url: string;
  page_hostname: string;
  image_source: ImageSource;
  target_language: TargetLanguage;
  is_retranslation: boolean;
  is_cache_only: boolean;
};

export type CancelPagePortMessage = {
  action: 'cancel-page';
  page_index: number;
};

export type WarmUpPortMessage = { action: 'warm-up' };

export type FinalizeChapterPortMessage = {
  action: 'finalize-chapter';
  series_id: string;
  chapter_number: string;
};

export type ChapterPortRequest =
  | TranslatePagePortMessage
  | CancelPagePortMessage
  | WarmUpPortMessage
  | FinalizeChapterPortMessage;

export type ChapterPortResponse =
  | ({ action: 'page-result' } & PageTranslationResult)
  | { action: 'page-error'; page_index: number; error_code: ErrorCode }
  | { action: 'capture-done'; page_index: number }
  | { action: 'warm-up-done' }
  | { action: 'chapter-finalized'; was_summarized: boolean };
