export const SERIES_MATCH_THRESHOLD = 0.8;
export const MAX_SERIES_CANDIDATES = 5;
export const MAX_TITLE_CANDIDATES = 12;
export const MAX_TITLE_CANDIDATE_LENGTH = 200;
export const MAX_INCOMING_TITLE_CANDIDATES = 20;
export const MAX_INCOMING_TITLE_LENGTH = 300;
export const MAX_INCOMING_URL_LENGTH = 2048;
export const MAX_HOSTNAME_LENGTH = 253;
export const MAX_SERIES_ID_LENGTH = 64;
export const MAX_PAGE_CHAPTER_NUMBER_LENGTH = 64;
export const MAX_JSON_LD_SCRIPTS = 10;
export const MAX_BREADCRUMB_ITEMS = 10;
export const MIN_USABLE_SEGMENT_LENGTH = 3;
export const GENERIC_PATH_SEGMENTS: ReadonlySet<string> = new Set([
  'read',
  'manga',
  'manhwa',
  'manhua',
  'comic',
  'comics',
  'webtoon',
  'webtoons',
  'series',
  'title',
  'titles',
  'chapter',
  'chapters',
  'episode',
  'episodes',
  'viewer'
]);
export const TITLE_NOISE_WORDS: ReadonlySet<string> = new Set([
  'read',
  'raw',
  'online',
  'free',
  'manga',
  'manhwa',
  'manhua',
  'webtoon',
  'comic',
  'english',
  'eng',
  'thai',
  'home'
]);
export const BREADCRUMB_SELECTOR =
  'nav[aria-label*="breadcrumb" i] a, .breadcrumb a, .breadcrumbs a, [itemtype*="BreadcrumbList"] [itemprop="name"]';
export const SERIES_DETECTION_ERROR_MESSAGES = {
  INVALID_PAGE_INFO: 'Invalid page information.',
  INVALID_CONFIRMATION: 'Invalid series confirmation.',
  SERIES_NOT_FOUND: 'This series no longer exists. Choose another series.',
  DETECT_FAILED: 'Unable to detect the series on this page.',
  CONFIRM_FAILED: 'Unable to link this series. Please try again.'
} as const;
