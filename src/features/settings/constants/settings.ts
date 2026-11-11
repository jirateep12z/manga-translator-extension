import {
  DEFAULT_OLLAMA_BASE_URL,
  REASONING_EFFORT_LEVELS
} from '@/services/ai-provider';
import type { Settings } from '../types/settings';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  is_enabled: true,
  target_language: 'th',
  reading_direction: 'auto',
  next_chapter_preload_count: 3,
  image_reading: {
    reader: 'ocr',
    provider: 'openrouter',
    model: '',
    reasoning_effort: 'model_default'
  },
  translation: {
    is_same_as_image_reading: false,
    provider: 'openrouter',
    model: '',
    reasoning_effort: 'model_default'
  },
  openrouter_api_key: '',
  ollama_base_url: DEFAULT_OLLAMA_BASE_URL
};

export const VALID_TARGET_LANGUAGES: ReadonlySet<string> = new Set<string>([
  'th',
  'en'
]);
export const VALID_READING_DIRECTIONS: ReadonlySet<string> = new Set<string>([
  'auto',
  'rtl',
  'ltr'
]);
export const VALID_IMAGE_READERS: ReadonlySet<string> = new Set<string>([
  'ocr',
  'ai'
]);
export const VALID_REASONING_EFFORTS: ReadonlySet<string> = new Set<string>([
  'model_default',
  ...REASONING_EFFORT_LEVELS
]);
export const MAX_MODEL_ID_LENGTH = 200;
// Each prepared chapter costs about 3 AI pages and 10 seconds.
export const MAX_NEXT_CHAPTER_PRELOAD_COUNT = 5;
