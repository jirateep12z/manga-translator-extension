import type { PageStatus } from '@/features/chapter-translation';
import { IsRecord } from '@/lib/is-record';

const URL_CHAPTER_PREFIX = 'url:';

export type PageStatusView = {
  is_available: boolean;
  series_label: string;
  chapter_label: string;
  can_translate: boolean;
  can_retranslate: boolean;
};

export const UNAVAILABLE_PAGE_STATUS: PageStatus = {
  is_available: false,
  series: null,
  chapter_number: null,
  page_count: 0,
  has_cached_translations: false,
  page_url: '',
  series_page_url: null,
  queue_status: 'idle',
  is_preload_run: false
};

const UNAVAILABLE_VIEW: PageStatusView = {
  is_available: false,
  series_label: '',
  chapter_label: '',
  can_translate: false,
  can_retranslate: false
};

function IsSeriesSummary(value: unknown): boolean {
  return (
    value === null ||
    (IsRecord(value) &&
      typeof value.series_id === 'string' &&
      typeof value.canonical_title === 'string')
  );
}

export function IsPageStatus(value: unknown): value is PageStatus {
  return (
    IsRecord(value) &&
    typeof value.is_available === 'boolean' &&
    IsSeriesSummary(value.series) &&
    (value.chapter_number === null ||
      typeof value.chapter_number === 'string') &&
    typeof value.page_count === 'number' &&
    Number.isFinite(value.page_count) &&
    typeof value.has_cached_translations === 'boolean'
  );
}

function DescribeChapter(chapter_number: string | null): string {
  if (
    chapter_number === null ||
    chapter_number.startsWith(URL_CHAPTER_PREFIX)
  ) {
    return 'Chapter unknown';
  }

  return `Chapter ${chapter_number}`;
}

function DescribeImageCount(page_count: number): string {
  if (page_count === 0) return 'No manga images found';

  return page_count === 1 ? '1 image found' : `${page_count} images found`;
}

export function DescribePageStatus(status: PageStatus | null): PageStatusView {
  if (!status?.is_available) return UNAVAILABLE_VIEW;

  const has_pages = status.page_count > 0;

  return {
    is_available: true,
    series_label: status.series?.canonical_title ?? 'Not linked',
    chapter_label: `${DescribeChapter(status.chapter_number)} · ${DescribeImageCount(status.page_count)}`,
    can_translate: has_pages,
    can_retranslate: has_pages && status.has_cached_translations
  };
}
