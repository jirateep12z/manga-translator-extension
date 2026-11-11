import type {
  DetectSeriesResponse,
  PageInfo
} from '@/features/series-detection';
import type { SeriesState } from '../types/series-state';

export function ToSeriesState(
  response: DetectSeriesResponse,
  page_info: PageInfo
): SeriesState {
  switch (response.status) {
    case 'bound':
      return {
        status: 'bound',
        series_id: response.series.series_id,
        canonical_title: response.series.canonical_title,
        chapter_number: response.chapter_number,
        detected_title:
          page_info.title_candidates[0] ?? response.series.canonical_title,
        is_auto_translate_enabled:
          response.series.is_auto_translate_enabled === true
      };
    case 'suggest':
      return {
        status: 'unlinked',
        detected_title: response.detected_title,
        candidates: response.candidates,
        chapter_number: response.chapter_number,
        is_detection_failed: false
      };
    default:
      return {
        status: 'unlinked',
        detected_title: page_info.title_candidates[0] ?? '',
        candidates: [],
        chapter_number: page_info.chapter_number ?? '',
        is_detection_failed: true
      };
  }
}
