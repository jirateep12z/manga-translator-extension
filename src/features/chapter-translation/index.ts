// React-free public entry; components and hooks are exported from './ui' so
// that the service worker and other non-UI modules never load React or UI
// libraries.
export { CHAPTER_TRANSLATION_PORT_NAME } from './constants/port';
export type { PageResult } from './hooks/use-chapter-translation';
export { FormatChapterLabel } from './lib/format-queue-text';
export { ResolvePanelVisibility } from './lib/resolve-panel-visibility';
export { HandleChapterTranslationPort } from './services/chapter-port.service';
export { HandleChapterStatusMessage } from './services/chapter-status.service';
export { HandleOpenOptionsMessage } from './services/open-options-message-handler.service';
export { HandleSeriesAutoTranslateMessage } from './services/series-auto-translate.service';
export { HandleSummarizeChapterMessage } from './services/summarize-chapter.service';
export {
  CreateTabMessageHandler,
  EMPTY_PAGE_STATUS,
  type TabCommandTarget
} from './services/tab-message-handler.service';
export type {
  GetChapterStatusMessage,
  GetChapterStatusResponse
} from './types/chapter-status';
export type {
  CancelPagePortMessage,
  ChapterPortRequest,
  ChapterPortResponse,
  FinalizeChapterPortMessage,
  ImageSource,
  PageOutcome,
  RenderedRegion,
  TranslatePagePortMessage,
  WarmUpPortMessage
} from './types/port-messages';
export type {
  PageJobStatus,
  QueueAction,
  QueueProgress,
  QueueState,
  QueueStatus
} from './types/queue';
export type {
  SetSeriesAutoTranslateMessage,
  SetSeriesAutoTranslateResponse
} from './types/series-auto-translate';
export type { SeriesListItem, SeriesState } from './types/series-state';
export type {
  SummarizeChapterMessage,
  SummarizeChapterResponse
} from './types/summarize-chapter';
export type {
  GetPageStatusMessage,
  OpenOptionsPageMessage,
  OpenSeriesPickerMessage,
  PageStatus,
  StartChapterTranslationMessage,
  TabCommandResponse
} from './types/tab-messages';
