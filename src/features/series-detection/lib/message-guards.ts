import { IsRecord } from '@/lib/is-record';
import {
  MAX_HOSTNAME_LENGTH,
  MAX_INCOMING_TITLE_CANDIDATES,
  MAX_INCOMING_TITLE_LENGTH,
  MAX_INCOMING_URL_LENGTH,
  MAX_PAGE_CHAPTER_NUMBER_LENGTH,
  MAX_SERIES_ID_LENGTH,
  MAX_TITLE_CANDIDATE_LENGTH
} from '../constants/series-detection';
import type {
  ConfirmSeriesMessage,
  DetectSeriesMessage,
  ListSeriesMessage
} from '../types/message';
import type { PageInfo } from '../types/page-info';

const URL_CHAPTER_PREFIX_LENGTH = 'url:'.length;

function IsBoundedString(
  value: unknown,
  max_length: number,
  min_length = 0
): value is string {
  return (
    typeof value === 'string' &&
    value.length >= min_length &&
    value.length <= max_length
  );
}

function IsTitleCandidates(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_INCOMING_TITLE_CANDIDATES &&
    value.every(candidate =>
      IsBoundedString(candidate, MAX_INCOMING_TITLE_LENGTH)
    )
  );
}

export function IsPageInfo(value: unknown): value is PageInfo {
  return (
    IsRecord(value) &&
    IsBoundedString(value.hostname, MAX_HOSTNAME_LENGTH, 1) &&
    IsBoundedString(value.url, MAX_INCOMING_URL_LENGTH) &&
    IsBoundedString(value.pathname, MAX_INCOMING_URL_LENGTH) &&
    value.pathname.startsWith('/') &&
    IsTitleCandidates(value.title_candidates) &&
    (value.chapter_number === null ||
      IsBoundedString(value.chapter_number, MAX_PAGE_CHAPTER_NUMBER_LENGTH))
  );
}

function HasExactlyOneTarget(message: Record<string, unknown>): boolean {
  const has_series_id = message.series_id !== undefined;
  const has_new_title = message.new_title !== undefined;

  if (has_series_id === has_new_title) return false;
  if (has_series_id) {
    return IsBoundedString(message.series_id, MAX_SERIES_ID_LENGTH, 1);
  }

  return (
    typeof message.new_title === 'string' &&
    IsBoundedString(message.new_title.trim(), MAX_TITLE_CANDIDATE_LENGTH, 1)
  );
}

export function IsDetectSeriesMessage(
  message: unknown
): message is DetectSeriesMessage {
  return (
    IsRecord(message) &&
    message.action === 'detect-series' &&
    IsPageInfo(message.page_info)
  );
}

export function IsConfirmSeriesMessage(
  message: unknown
): message is ConfirmSeriesMessage {
  return (
    IsRecord(message) &&
    message.action === 'confirm-series' &&
    IsPageInfo(message.page_info) &&
    IsBoundedString(message.detected_title, MAX_INCOMING_TITLE_LENGTH) &&
    IsBoundedString(
      message.chapter_number,
      MAX_INCOMING_URL_LENGTH + URL_CHAPTER_PREFIX_LENGTH,
      1
    ) &&
    HasExactlyOneTarget(message)
  );
}

export function IsListSeriesMessage(
  message: unknown
): message is ListSeriesMessage {
  return IsRecord(message) && message.action === 'list-series';
}
