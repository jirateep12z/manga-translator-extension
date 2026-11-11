// React-free public entry; components and hooks are exported from './ui' so
// that the service worker and other non-UI modules never load React or UI
// libraries.
export {
  DEFAULT_SETTINGS,
  MAX_NEXT_CHAPTER_PRELOAD_COUNT,
  VALID_READING_DIRECTIONS,
  VALID_TARGET_LANGUAGES
} from './constants/settings';
export {
  CHROME_STORAGE_AREA,
  CHROME_STORAGE_KEY,
  LEGACY_LOCAL_STORAGE_KEY,
  LOCAL_STORAGE_KEY,
  THEME_CACHE_STORAGE_KEY
} from './constants/storage';
export { BuildModelOptions } from './lib/build-model-options';
export {
  ChangeStageModel,
  ChangeStageProvider,
  SetTranslationSameAsImageReading
} from './lib/change-stage-settings';
export { IsNextChapterPreloadCount, MergeSettings } from './lib/merge-settings';
export { CreatePublicSettings } from './lib/public-settings';
export {
  CreateProviderConnection,
  IsProviderConfigured,
  ResolveProviderStages,
  ResolveStageProvider,
  ToCompletionReasoningEffort
} from './lib/stage-provider';
export {
  CacheTheme,
  ReadCachedTheme,
  RemoveLegacySettingsCache
} from './lib/theme-cache';
export { ValidateOllamaBaseUrl } from './lib/validate-ollama-base-url';
export { BroadcastPublicSettingsChange } from './services/settings-broadcast.service';
export { HandleSettingsMessage } from './services/settings-message-handler.service';
export {
  ReadSettings,
  WriteSettings
} from './services/settings-storage.service';
export type {
  GetSettingsMessage,
  GetSettingsResponse,
  IncomingSettingsMessage,
  SaveSettingsMessage,
  SaveSettingsResponse,
  SettingsChangedMessage,
  UpdateTargetLanguageMessage
} from './types/message';
export type {
  ImageReader,
  PublicSettings,
  ReadingDirection,
  ReasoningEffort,
  Settings,
  StageProvider,
  TargetLanguage
} from './types/settings';
