import {
  VALID_TARGET_LANGUAGES,
  type TargetLanguage
} from '@/features/settings';
import { IsRecord } from '@/lib/is-record';
import type { GetChapterStatusMessage } from '../types/chapter-status';
import type { ChapterPortRequest, ImageSource } from '../types/port-messages';
import type { SetSeriesAutoTranslateMessage } from '../types/series-auto-translate';
import type { SummarizeChapterMessage } from '../types/summarize-chapter';

function IsNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function IsPageIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function IsTargetLanguage(value: unknown): value is TargetLanguage {
  return typeof value === 'string' && VALID_TARGET_LANGUAGES.has(value);
}

function IsFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function IsCssRect(value: unknown): boolean {
  return (
    IsRecord(value) &&
    IsFiniteNumber(value.x) &&
    IsFiniteNumber(value.y) &&
    IsFiniteNumber(value.width) &&
    IsFiniteNumber(value.height) &&
    value.width > 0 &&
    value.height > 0
  );
}

function IsImageSource(value: unknown): value is ImageSource {
  if (!IsRecord(value)) return false;

  switch (value.type) {
    case 'url':
      return (
        IsNonEmptyString(value.image_url) &&
        typeof value.is_referrer_hidden === 'boolean'
      );
    case 'inline':
      return (
        IsNonEmptyString(value.image_base64) &&
        IsNonEmptyString(value.mime_type)
      );
    case 'capture':
      return (
        IsNonEmptyString(value.image_url) &&
        IsCssRect(value.rect_css_px) &&
        IsFiniteNumber(value.device_pixel_ratio) &&
        value.device_pixel_ratio > 0
      );
    default:
      return false;
  }
}

function IsTranslatePageMessage(message: Record<string, unknown>): boolean {
  return (
    IsNonEmptyString(message.series_id) &&
    IsNonEmptyString(message.chapter_number) &&
    IsPageIndex(message.page_index) &&
    IsNonEmptyString(message.page_url) &&
    IsNonEmptyString(message.page_hostname) &&
    IsImageSource(message.image_source) &&
    IsTargetLanguage(message.target_language) &&
    typeof message.is_retranslation === 'boolean' &&
    typeof message.is_cache_only === 'boolean' &&
    // A cache-only run never retranslates (spec 0005 §4.3).
    !(message.is_cache_only && message.is_retranslation)
  );
}

export function IsChapterPortRequest(
  value: unknown
): value is ChapterPortRequest {
  if (!IsRecord(value)) return false;

  switch (value.action) {
    case 'translate-page':
      return IsTranslatePageMessage(value);
    case 'cancel-page':
      return IsPageIndex(value.page_index);
    case 'warm-up':
      return true;
    case 'finalize-chapter':
      return (
        IsNonEmptyString(value.series_id) &&
        IsNonEmptyString(value.chapter_number)
      );
    default:
      return false;
  }
}

export function IsSummarizeChapterMessage(
  value: unknown
): value is SummarizeChapterMessage {
  return (
    IsRecord(value) &&
    value.action === 'summarize-chapter' &&
    IsNonEmptyString(value.series_id) &&
    IsNonEmptyString(value.chapter_number)
  );
}

export function IsGetChapterStatusMessage(
  value: unknown
): value is GetChapterStatusMessage {
  return (
    IsRecord(value) &&
    value.action === 'get-chapter-status' &&
    IsNonEmptyString(value.series_id) &&
    IsNonEmptyString(value.chapter_number) &&
    IsTargetLanguage(value.target_language) &&
    IsNonEmptyString(value.page_hostname)
  );
}

export function IsSetSeriesAutoTranslateMessage(
  value: unknown
): value is SetSeriesAutoTranslateMessage {
  return (
    IsRecord(value) &&
    value.action === 'set-series-auto-translate' &&
    IsNonEmptyString(value.series_id) &&
    typeof value.is_auto_translate_enabled === 'boolean'
  );
}
