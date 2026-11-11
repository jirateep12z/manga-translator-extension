import type { QueueStatus } from './queue';

export type GetPageStatusMessage = { action: 'get-page-status' };

export type PageStatus = {
  is_available: boolean;
  series: { series_id: string; canonical_title: string } | null;
  chapter_number: string | null;
  page_count: number;
  has_cached_translations: boolean;
  // Read by the next-chapter preload session (spec 0006 §4.5).
  page_url: string;
  series_page_url: string | null;
  queue_status: QueueStatus;
  is_preload_run: boolean;
};

export type StartChapterTranslationMessage = {
  action: 'start-chapter-translation';
  is_retranslation: boolean;
};

export type OpenSeriesPickerMessage = { action: 'open-series-picker' };

export type TabCommandResponse = { accepted: boolean };

export type OpenOptionsPageMessage = { action: 'open-options-page' };
