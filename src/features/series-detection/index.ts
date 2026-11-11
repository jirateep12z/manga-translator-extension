export {
  MAX_SERIES_CANDIDATES,
  SERIES_MATCH_THRESHOLD
} from './constants/series-detection';
export { ExtractChapterNumber } from './lib/extract-chapter-number';
export { ExtractPageInfo } from './lib/extract-page-info';
export { HandleSeriesDetectionMessage } from './services/message-handler.service';
export type {
  ConfirmSeriesMessage,
  ConfirmSeriesResponse,
  DetectSeriesMessage,
  DetectSeriesResponse,
  ListSeriesMessage,
  ListSeriesResponse
} from './types/message';
export type {
  DetectSeriesResult,
  PageInfo,
  SeriesCandidate
} from './types/page-info';
