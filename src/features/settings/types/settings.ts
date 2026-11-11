import type { Theme } from '@/features/theme';
import type {
  ProviderName,
  ReasoningEffortLevel
} from '@/services/ai-provider';
import type { ImageReader } from '@/types/image-reader';
import type { TargetLanguage } from '@/types/target-language';

export type { ImageReader } from '@/types/image-reader';
export type { TargetLanguage } from '@/types/target-language';

export type ReadingDirection = 'auto' | 'rtl' | 'ltr';

// 'model_default' sends no reasoning field, so the model decides.
export type ReasoningEffort = 'model_default' | ReasoningEffortLevel;

export type StageProvider = {
  provider: ProviderName;
  model: string;
  reasoning_effort: ReasoningEffort;
};

export type Settings = {
  theme: Theme;
  is_enabled: boolean;
  target_language: TargetLanguage;
  reading_direction: ReadingDirection;
  // How many next chapters a preload session prepares; 0 turns it off
  // (spec 0006 §7.7).
  next_chapter_preload_count: number;
  image_reading: StageProvider & { reader: ImageReader };
  translation: StageProvider & { is_same_as_image_reading: boolean };
  openrouter_api_key: string;
  ollama_base_url: string;
};

export type PublicSettings = {
  theme: Theme;
  is_enabled: boolean;
  target_language: TargetLanguage;
  reading_direction: ReadingDirection;
  is_provider_configured: boolean;
};
