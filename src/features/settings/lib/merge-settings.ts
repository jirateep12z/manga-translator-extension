import { VALID_THEMES } from '@/features/theme';
import { IsRecord } from '@/lib/is-record';
import {
  DEFAULT_OLLAMA_BASE_URL,
  VALID_PROVIDER_NAMES
} from '@/services/ai-provider';
import {
  DEFAULT_SETTINGS,
  MAX_MODEL_ID_LENGTH,
  MAX_NEXT_CHAPTER_PRELOAD_COUNT,
  VALID_IMAGE_READERS,
  VALID_READING_DIRECTIONS,
  VALID_REASONING_EFFORTS,
  VALID_TARGET_LANGUAGES
} from '../constants/settings';
import type { Settings, StageProvider } from '../types/settings';
import { CopyImageReadingToTranslation } from './change-stage-settings';

const ALLOWED_OLLAMA_PROTOCOLS = new Set(['http:', 'https:']);

function ReadEnumValue<TValue extends string>(
  value: unknown,
  valid_values: ReadonlySet<string>,
  fallback: TValue
): TValue {
  return typeof value === 'string' && valid_values.has(value)
    ? (value as TValue)
    : fallback;
}

function ReadBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function IsNextChapterPreloadCount(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= MAX_NEXT_CHAPTER_PRELOAD_COUNT
  );
}

function ReadModelId(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().slice(0, MAX_MODEL_ID_LENGTH)
    : '';
}

function ReadStageProvider(
  value: unknown,
  fallback: StageProvider
): StageProvider {
  if (!IsRecord(value)) return { ...fallback };

  return {
    provider: ReadEnumValue(
      value.provider,
      VALID_PROVIDER_NAMES,
      fallback.provider
    ),
    model: ReadModelId(value.model),
    reasoning_effort: ReadEnumValue(
      value.reasoning_effort,
      VALID_REASONING_EFFORTS,
      fallback.reasoning_effort
    )
  };
}

function ReadImageReadingStage(value: unknown): Settings['image_reading'] {
  return {
    ...ReadStageProvider(value, DEFAULT_SETTINGS.image_reading),
    reader: ReadEnumValue(
      IsRecord(value) ? value.reader : undefined,
      VALID_IMAGE_READERS,
      DEFAULT_SETTINGS.image_reading.reader
    )
  };
}

// Settings saved before spec 0002 have no valid reader (spec 0002 §9.3).
function IsLegacyImageReading(value: unknown): boolean {
  return !(
    IsRecord(value) &&
    typeof value.reader === 'string' &&
    VALID_IMAGE_READERS.has(value.reader)
  );
}

function ReadTranslationStage(
  value: unknown,
  image_reading: Settings['image_reading'],
  is_legacy: boolean
): Settings['translation'] {
  const stored_is_same = IsRecord(value)
    ? value.is_same_as_image_reading
    : undefined;

  // The old MergeSettings read a missing or invalid flag as true, so only an
  // explicit false kept a separate stage (spec 0002 §9.3).
  if (is_legacy && stored_is_same !== false) {
    return CopyImageReadingToTranslation(image_reading);
  }

  return {
    is_same_as_image_reading: ReadBoolean(
      stored_is_same,
      DEFAULT_SETTINGS.translation.is_same_as_image_reading
    ),
    ...ReadStageProvider(value, DEFAULT_SETTINGS.translation)
  };
}

function NormalizeOllamaBaseUrl(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_OLLAMA_BASE_URL;
  try {
    const url = new URL(value.trim());

    if (!ALLOWED_OLLAMA_PROTOCOLS.has(url.protocol)) {
      return DEFAULT_OLLAMA_BASE_URL;
    }

    return url.origin + url.pathname.replace(/\/+$/, '');
  } catch {
    return DEFAULT_OLLAMA_BASE_URL;
  }
}

export function MergeSettings(partial: Partial<Settings>): Settings {
  if (!IsRecord(partial)) {
    return {
      ...DEFAULT_SETTINGS,
      image_reading: { ...DEFAULT_SETTINGS.image_reading },
      translation: { ...DEFAULT_SETTINGS.translation }
    };
  }

  const image_reading = ReadImageReadingStage(partial.image_reading);

  return {
    theme: ReadEnumValue(partial.theme, VALID_THEMES, DEFAULT_SETTINGS.theme),
    is_enabled: ReadBoolean(partial.is_enabled, DEFAULT_SETTINGS.is_enabled),
    target_language: ReadEnumValue(
      partial.target_language,
      VALID_TARGET_LANGUAGES,
      DEFAULT_SETTINGS.target_language
    ),
    reading_direction: ReadEnumValue(
      partial.reading_direction,
      VALID_READING_DIRECTIONS,
      DEFAULT_SETTINGS.reading_direction
    ),
    next_chapter_preload_count: IsNextChapterPreloadCount(
      partial.next_chapter_preload_count
    )
      ? partial.next_chapter_preload_count
      : DEFAULT_SETTINGS.next_chapter_preload_count,
    image_reading,
    translation: ReadTranslationStage(
      partial.translation,
      image_reading,
      IsLegacyImageReading(partial.image_reading)
    ),
    openrouter_api_key:
      typeof partial.openrouter_api_key === 'string'
        ? partial.openrouter_api_key.trim()
        : '',
    ollama_base_url: NormalizeOllamaBaseUrl(partial.ollama_base_url)
  };
}
