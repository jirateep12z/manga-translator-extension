import type { TargetLanguage } from '@/features/settings';

export const MAX_SERIES_TITLE_LENGTH = 200;

export const TARGET_LANGUAGES: readonly TargetLanguage[] = ['th', 'en'];

export const LANGUAGE_LABELS: Record<TargetLanguage, string> = {
  th: 'Thai',
  en: 'English'
};

export const SAVE_FAILED_MESSAGE = "Couldn't save the change. Try again.";
