export { DATABASE_NAME, DATABASE_VERSION } from './constants/database';
export { OpenDatabase, ResetDatabaseConnection } from './lib/open-database';
export type { MangaTranslatorDatabase } from './lib/open-database';
export type {
  AddressTerm,
  BboxPx,
  ChapterRecord,
  ChapterStatus,
  EntityKind,
  EntityRecord,
  EntityTranslation,
  Gender,
  MangaTranslatorSchema,
  PageNote,
  PageReadingRecord,
  PageTranslationRecord,
  RegionAppearance,
  RegionBackdrop,
  RegionFrame,
  RegionKind,
  RegionLettering,
  RegionTranslation,
  SeriesRecord,
  SiteBindingRecord,
  SourceLanguage,
  SpeechProfile,
  SpeechValue,
  TextRegion
} from './types/records';
