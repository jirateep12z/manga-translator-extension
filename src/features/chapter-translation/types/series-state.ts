import type { SeriesCandidate } from '@/features/series-detection';

export type SeriesState =
  | {
      status: 'bound';
      series_id: string;
      canonical_title: string;
      chapter_number: string;
      detected_title: string;
      is_auto_translate_enabled: boolean;
    }
  | {
      status: 'unlinked';
      detected_title: string;
      candidates: SeriesCandidate[];
      chapter_number: string;
      is_detection_failed: boolean;
    };

export type SeriesListItem = { series_id: string; canonical_title: string };
