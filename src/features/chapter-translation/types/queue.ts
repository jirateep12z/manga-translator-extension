import type { ErrorCode } from '@/types/error-code';
import type { TargetLanguage } from '@/types/target-language';
import type { PageOutcome } from './port-messages';

export type QueueStatus =
  | 'idle'
  | 'confirming-series'
  | 'translating'
  | 'paused'
  | 'completed'
  | 'stopped'
  | 'error';

export type PageJobStatus =
  | 'pending'
  | 'in_flight'
  | 'done'
  | 'failed'
  // A page that a cache-only run could not show (spec 0005 §6.2).
  | 'skipped';

export type PageJob = {
  page_id: string;
  page_index: number;
  status: PageJobStatus;
  outcome: PageOutcome | null;
  error_code: ErrorCode | null;
  resend_count: number;
  use_capture: boolean;
};

export type QueueState = {
  status: QueueStatus;
  series_id: string | null;
  chapter_number: string | null;
  target_language: TargetLanguage;
  is_retranslation: boolean;
  // Shows cached translations only, with no AI call (spec 0005 §6).
  is_cache_only: boolean;
  // Started by a next-chapter preload session (spec 0006 §4.1).
  is_preload: boolean;
  is_warming_up: boolean;
  jobs: PageJob[];
  stop_error_code: ErrorCode | null;
};

export type QueueAction =
  | { type: 'REQUEST_SERIES_CONFIRMATION' }
  | { type: 'CANCEL_SERIES_CONFIRMATION' }
  | {
      type: 'START';
      series_id: string;
      chapter_number: string;
      target_language: TargetLanguage;
      is_retranslation: boolean;
      is_cache_only: boolean;
      is_preload: boolean;
      page_ids: string[];
      first_visible_position: number;
    }
  | { type: 'WARM_UP_DONE' }
  | { type: 'PAGE_SENT'; page_index: number }
  | { type: 'PAGE_RESULT'; page_index: number; outcome: PageOutcome }
  | { type: 'PAGE_ERROR'; page_index: number; error_code: ErrorCode }
  | { type: 'PORT_DISCONNECTED' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'PAGES_FOUND'; page_ids: string[] }
  | { type: 'RETRY_PAGE'; page_index: number; use_capture: boolean }
  | { type: 'RESET' };

export type QueueProgress = {
  total_count: number;
  finished_count: number;
  translated_count: number;
  warning_count: number;
  failed_count: number;
  skipped_count: number;
};
