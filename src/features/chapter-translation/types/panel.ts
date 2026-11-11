import type { SeriesCandidate } from '@/features/series-detection';
import type { TargetLanguage } from '@/types/target-language';
import type { ReactNode } from 'react';
import type { QueueState } from './queue';
import type { SeriesListItem } from './series-state';

export type SeriesConfirmationCardProps = {
  all_series: SeriesListItem[];
  candidates: SeriesCandidate[];
  chapter_number: string;
  detected_title: string;
  error_message: string | null;
  is_submitting: boolean;
  mode: 'confirm' | 'choose';
  OnCancel: () => void;
  OnConfirmExisting: (series_id: string, chapter_number: string) => void;
  OnCreateNew: (new_title: string, chapter_number: string) => void;
};

export type FloatingPanelProps = {
  // null hides the checkbox, for a page whose series is not bound.
  auto_translate: { is_enabled: boolean; is_saving: boolean } | null;
  confirmation: ReactNode | null;
  has_cached_translations: boolean;
  header_text: string;
  is_expanded: boolean;
  is_provider_configured: boolean;
  is_showing_original: boolean;
  // The next-chapter preload line; null hides it (spec 0006 §8).
  preload_status_text: string | null;
  queue_state: QueueState;
  target_language: TargetLanguage;
  OnAutoTranslateChange: (is_auto_translate_enabled: boolean) => void;
  OnExpandedChange: (is_expanded: boolean) => void;
  OnOpenSettings: () => void;
  OnPause: () => void;
  OnResume: () => void;
  OnShowOriginalChange: (is_showing_original: boolean) => void;
  OnStart: (is_retranslation: boolean) => void;
  OnStop: () => void;
  OnTargetLanguageChange: (target_language: TargetLanguage) => void;
};
