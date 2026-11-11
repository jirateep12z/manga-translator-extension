import type { SeriesRecord } from '@/services/database';
import type { DetectSeriesResult, PageInfo } from './page-info';

export type DetectSeriesMessage = {
  action: 'detect-series';
  page_info: PageInfo;
};

export type ConfirmSeriesMessage = {
  action: 'confirm-series';
  page_info: PageInfo;
  detected_title: string;
  chapter_number: string;
  series_id?: string;
  new_title?: string;
};

export type ConfirmSeriesResponse =
  { success: true; series: SeriesRecord } | { success: false; error: string };

export type ListSeriesMessage = { action: 'list-series' };

export type ListSeriesResponse = {
  series: { series_id: string; canonical_title: string }[];
};

export type DetectSeriesResponse =
  DetectSeriesResult | { status: 'error'; error: string };
