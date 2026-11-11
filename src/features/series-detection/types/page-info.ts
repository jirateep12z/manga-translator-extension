import type { SeriesRecord } from '@/services/database';

export type PageInfo = {
  hostname: string;
  url: string;
  pathname: string;
  title_candidates: string[];
  chapter_number: string | null;
};

export type SeriesCandidate = {
  series_id: string;
  title: string;
  score: number;
};

export type DetectSeriesResult =
  | { status: 'bound'; series: SeriesRecord; chapter_number: string }
  | {
      status: 'suggest';
      detected_title: string;
      candidates: SeriesCandidate[];
      chapter_number: string;
    };
